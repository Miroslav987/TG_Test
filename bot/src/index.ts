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
import { pauseConversation } from "./conversations/pause";
import { prisma, sendTelegramMessage } from "@standup/shared";

export type MyContext = Context & { session: { editTaskId?: string; customQuestionId?: string; promptMessageId?: number; [key: string]: any } }; 
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(newTaskConversation, "newTask"));
bot.use(createConversation(newProjectConversation, "newProject"));
bot.use(createConversation(editTaskConversation, "editTask"));
bot.use(createConversation(customQuestionConversation, "customQuestion"));
bot.use(createConversation(pauseConversation, "pause"));

export const MENU_TRIGGERS = [
  "➕ Новая задача", "📂 Новый проект", "📋 Мои задачи", "❓ Помощь", 
  "/newtask", "/newproject", "/mytasks", "/myprojects", "/start", "/menu", "/pause", "/unpause"
];

// УБРАЛИ .persistent()
export const mainMenuKeyboard = new Keyboard()
  .text("➕ Новая задача").text("📂 Новый проект").row()
  .text("📋 Мои задачи").row()
  .text("❓ Помощь")
  .resized(); 

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

bot.command("menu", async (ctx) => {
  await ctx.reply("Вот меню 👇", { reply_markup: mainMenuKeyboard });
});

bot.hears("❓ Помощь", async (ctx) => {
  await ctx.reply(
    "🤖 *Что я умею:*\n\n" +
    "➕ *Новая задача* — быстро добавить таск в проект\n" +
    "📂 *Новый проект* — создать проект и стать его участником\n" +
    "📋 *Мои задачи* — посмотреть открытые таски и изменить их статусы\n" +
    "📁 */myprojects* — список твоих проектов\n\n" +
    "А ещё я буду присылать опросы по расписанию, чтобы собирать отчёты для команды!",
    { parse_mode: "Markdown", reply_markup: mainMenuKeyboard }
  );
});

bot.hears("➕ Новая задача", async (ctx) => ctx.conversation.enter("newTask"));
bot.command("newtask", async (ctx) => ctx.conversation.enter("newTask"));

bot.hears("📂 Новый проект", async (ctx) => ctx.conversation.enter("newProject"));
bot.command("newproject", async (ctx) => ctx.conversation.enter("newProject"));

bot.command("pause", async (ctx) => ctx.conversation.enter("pause"));
bot.command("unpause", async (ctx) => {
  await prisma.user.update({ where: { telegramId: ctx.from!.id }, data: { pausedUntil: null } });
  await ctx.reply("✅ Пауза снята, снова на связи.");
});

// НОВАЯ КОМАНДА: МОИ ПРОЕКТЫ
bot.command("myprojects", async (ctx) => {
  const user = await prisma.user.findUnique({ 
    where: { telegramId: ctx.from?.id },
    include: { 
      projects: { 
        where: { isActive: true },
        include: { _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } }
      } 
    }
  });
  
  if (!user) return;
  if (user.projects.length === 0) {
    return ctx.reply("Ты пока не состоишь ни в одном проекте.");
  }
  
  const lines = user.projects.map(p => `📂 *${p.name}* — ${p._count.tasks} открытых задач`);
  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
});

const myTasksHandler = async (ctx: MyContext) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  if (!user) return;

  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id, status: { not: "DONE" } },
    include: { project: true }, // Подтягиваем проект
  });

  if (tasks.length === 0) {
    await ctx.reply("У тебя сейчас нет открытых задач 🎉");
    return;
  }

  // Группируем с защитой от null
  const grouped = tasks.reduce((acc, task) => {
    const pName = task.project?.name ?? "Без проекта";
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(task);
    return acc;
  }, {} as Record<string, typeof tasks>);

  // Сортируем ключи, чтобы "Без проекта" было в самом низу
  const pNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Без проекта") return 1;
    if (b === "Без проекта") return -1;
    return a.localeCompare(b);
  });

  for (const pName of pNames) {
    const icon = pName === "Без проекта" ? "📋" : "📂";
    await ctx.reply(`${icon} *${pName}*:`, { parse_mode: "Markdown" });
    
    for (const t of grouped[pName]) {
      const kb = new InlineKeyboard()
        .text("✏️ Редактировать", `edit_task_${t.id}`)
        .text("🗑️ Удалить", `delete_task_${t.id}`);
        
      await ctx.reply(`  • ${t.title} [${t.status}]`, { reply_markup: kb });
    }
  }
};

bot.hears("📋 Мои задачи", myTasksHandler);
bot.command("mytasks", myTasksHandler);

// ... (Остальные защищённые обработчики callbackQuery остаются без изменений) ...

bot.on("message:text", async (ctx) => {
  await ctx.reply(
    "Не понял тебя 🙂\n\nВоспользуйся кнопками внизу экрана или командами:\n/newtask — добавить задачу\n/newproject — создать проект\n/mytasks — посмотреть список задач\n\nЕсли ждёшь чек-ин — дождись сообщения от меня по расписанию.",
    { reply_markup: mainMenuKeyboard }
  );
});

bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot);
  },
});

export { prisma };