import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), "../.env") });

import { Bot, session, Context, Keyboard, InlineKeyboard } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { startScheduler } from "./scheduler";
import { newTaskConversation } from "./conversations/newTask";
import { newProjectConversation } from "./conversations/newProject";
import { editTaskConversation } from "./conversations/editTask";
import { customQuestionConversation } from "./conversations/customQuestion";
import { prisma } from "@standup/shared";
import { eveningConversation } from "./conversations/evening";
import { morningConversation } from "./conversations/morning";

export type MyContext = Context & { session: { editTaskId?: string; customQuestionId?: string; [key: string]: any } }; 
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(newTaskConversation, "newTask"));
bot.use(createConversation(newProjectConversation, "newProject"));
bot.use(createConversation(editTaskConversation, "editTask"));
bot.use(createConversation(customQuestionConversation, "customQuestion"));

bot.use(createConversation(morningConversation, "morning")); // <--- Регистрация
bot.use(createConversation(eveningConversation, "evening"));

// === СОЗДАЕМ ПОСТОЯННОЕ ГЛАВНОЕ МЕНЮ ===
export const mainMenuKeyboard = new Keyboard()
  .text("➕ Новая задача").text("📂 Новый проект").row()
  .text("📋 Мои задачи").row()
  .text("❓ Помощь")
  .resized()
  .persistent(); // <-- Меню не будет сворачиваться само

// Команда /start
bot.command("start", async (ctx) => {
  const token = ctx.match;
  
  if (!token) {
    const existingUser = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
    if (existingUser) {
      return ctx.reply("С возвращением! Вот меню 👇", { reply_markup: mainMenuKeyboard });
    }
    return ctx.reply("Привет! Для использования бота нужна ссылка-приглашение.");
  }

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) return ctx.reply("Неверный или устаревший токен.");

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: ctx.from?.id, inviteToken: null },
  });

  await ctx.reply(`Отлично, ${user.name}! Твой Telegram привязан. Я буду писать тебе по расписанию.`, {
    reply_markup: mainMenuKeyboard
  });
});

// === НОВЫЕ КОМАНДЫ ДЛЯ МЕНЮ ===
bot.command("menu", async (ctx) => {
  await ctx.reply("Вот меню 👇", { reply_markup: mainMenuKeyboard });
});

bot.hears("❓ Помощь", async (ctx) => {
  await ctx.reply(
    "🤖 *Что я умею:*\n\n" +
    "➕ *Новая задача* — быстро добавить таск в проект\n" +
    "📂 *Новый проект* — создать проект и стать его участником\n" +
    "📋 *Мои задачи* — посмотреть открытые таски и изменить их статусы\n\n" +
    "А ещё я буду присылать опросы по расписанию, чтобы собирать отчёты для команды!",
    { parse_mode: "Markdown", reply_markup: mainMenuKeyboard }
  );
});

// Алиасы для действий
bot.hears("➕ Новая задача", async (ctx) => ctx.conversation.enter("newTask"));
bot.command("newtask", async (ctx) => ctx.conversation.enter("newTask"));

bot.hears("📂 Новый проект", async (ctx) => ctx.conversation.enter("newProject"));
bot.command("newproject", async (ctx) => ctx.conversation.enter("newProject"));

const myTasksHandler = async (ctx: MyContext) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  if (!user) return;

  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id, status: { not: "DONE" } },
    include: { project: true },
    orderBy: { project: { name: 'asc' } }
  });

  if (tasks.length === 0) {
    await ctx.reply("У тебя сейчас нет открытых задач 🎉");
    return;
  }

  const grouped = tasks.reduce((acc, task) => {
    if (!acc[task.project.name]) acc[task.project.name] = [];
    acc[task.project.name].push(task);
    return acc;
  }, {} as Record<string, typeof tasks>);

  for (const [pName, pTasks] of Object.entries(grouped)) {
    await ctx.reply(`📂 *${pName}*:`, { parse_mode: "Markdown" });
    
    for (const t of pTasks) {
      const kb = new InlineKeyboard()
        .text("✏️ Редактировать", `edit_task_${t.id}`)
        .text("🗑️ Удалить", `delete_task_${t.id}`);
        
      await ctx.reply(`  • ${t.title} [${t.status}]`, { reply_markup: kb });
    }
  }
};

bot.hears("📋 Мои задачи", myTasksHandler);
bot.command("mytasks", myTasksHandler);

// Обработчики инлайн-кнопок
bot.callbackQuery("start_morning", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("morning");
});

bot.callbackQuery("start_evening", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("evening");
});

bot.callbackQuery(/^ans_custom_(.+)$/, async (ctx) => {
  ctx.session.customQuestionId = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("customQuestion");
});

bot.callbackQuery(/^ack_task_.+/, async (ctx) => {
  const taskId = ctx.callbackQuery.data.replace("ack_task_", "");
  try {
    await prisma.task.update({ where: { id: taskId }, data: { acknowledgedAt: new Date() } });
    await ctx.answerCallbackQuery("Принято!");
    const text = ctx.callbackQuery.message?.text || "📌 Задача";
    const dateStr = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    await ctx.editMessageText(`${text}\n\n✅ Принято ${dateStr}`);
  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
  }
});

bot.callbackQuery(/^delete_task_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  try {
    await prisma.task.delete({ where: { id } });
    await ctx.answerCallbackQuery("Задача удалена");
    await ctx.deleteMessage(); 
  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Ошибка удаления", show_alert: true });
  }
});

bot.callbackQuery(/^edit_task_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  ctx.session.editTaskId = id;
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editTask");
});

// CATCH-ALL ОБНОВЛЕН
bot.on("message:text", async (ctx) => {
  await ctx.reply(
    "Не понял тебя 🙂\n\nВоспользуйся кнопками внизу экрана или командами:\n/newtask — добавить задачу\n/newproject — создать проект\n/mytasks — посмотреть список задач\n\nЕсли ждёшь чек-ин — дождись сообщения от меня по расписанию.",
    { reply_markup: mainMenuKeyboard } // Прикрепляем клавиатуру, если её нет
  );
});

bot.catch((err) => {
  console.error("Ошибка в работе бота:", err);
});

bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot);
  },
});

export { prisma };