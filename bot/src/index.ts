import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), "../.env") });

import { Bot, session, Context } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { startScheduler } from "./scheduler";
import { morningConversation } from "./conversations/morning";
import { eveningConversation } from "./conversations/evening";
import { newTaskConversation } from "./conversations/newTask"; // <-- ДОБАВЛЕНО
import { prisma } from "@standup/shared";

export type MyContext = Context & { session: any }; 
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(morningConversation, "morning"));
bot.use(createConversation(eveningConversation, "evening"));
bot.use(createConversation(newTaskConversation, "newTask")); // <-- ДОБАВЛЕНО

// Команда /start
bot.command("start", async (ctx) => {
  const token = ctx.match;
  if (!token) return ctx.reply("Привет! Для использования бота нужна ссылка-приглашение.");

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) return ctx.reply("Неверный или устаревший токен.");

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: ctx.from?.id, inviteToken: null },
  });

  await ctx.reply(`Отлично, ${user.name}! Твой Telegram привязан. Я буду писать тебе по расписанию.`);
});

// Команда /newtask <-- ДОБАВЛЕНО
bot.command("newtask", async (ctx) => {
  await ctx.conversation.enter("newTask");
});

bot.callbackQuery("start_morning", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("morning");
});

bot.callbackQuery("start_evening", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("evening");
});

// Обработчик принятия задачи
bot.callbackQuery(/^ack_task_.+/, async (ctx) => {
  const taskId = ctx.callbackQuery.data.replace("ack_task_", "");
  
  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { acknowledgedAt: new Date() }
    });
    
    await ctx.answerCallbackQuery("Принято!");
    
    const text = ctx.callbackQuery.message?.text || "📌 Задача";
    const dateStr = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    
    await ctx.editMessageText(`${text}\n\n✅ Принято ${dateStr}`);
  } catch (error) {
    console.error("Ошибка при подтверждении задачи:", error);
    await ctx.answerCallbackQuery({ text: "Ошибка (возможно, задача удалена)", show_alert: true });
  }
});

// Обработчик любого другого текста (Catch-all) <-- ДОБАВЛЕНО В САМОМ КОНЦЕ
bot.on("message:text", async (ctx) => {
  await ctx.reply("Не понял тебя 🙂\n\nЕсли хочешь добавить задачу — напиши /newtask.\nЕсли ждёшь утренний/вечерний чек-ин — дождись сообщения от меня по расписанию.");
});

// Запуск бота (Перенесено в самый низ) <-- ИЗМЕНЁН ПОРЯДОК
bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot);
  },
});

export { prisma };