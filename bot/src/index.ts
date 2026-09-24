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
import { newQuestionConversation } from "./conversations/newQuestion";
import { viewReportsConversation } from "./conversations/viewReports"; // <-- ДОБАВЛЕНО
import { eveningConversation } from "./conversations/evening"; // <-- ДОБАВЛЕНО
import { morningConversation } from "./conversations/morning"; // <-- ДОБАВЛЕНО
import { prisma, sendTelegramMessage } from "@standup/shared";
import { absenceConversation } from "./conversations/absence";
import { formatInTimeZone } from "date-fns-tz";

export type MyContext = Context & { session: { editTaskId?: string; customQuestionId?: string; promptMessageId?: number; [key: string]: any } }; 
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(newTaskConversation, "newTask"));
bot.use(createConversation(newProjectConversation, "newProject"));
bot.use(createConversation(editTaskConversation, "editTask"));
bot.use(createConversation(customQuestionConversation, "customQuestion"));
bot.use(createConversation(pauseConversation, "pause"));
bot.use(createConversation(newQuestionConversation, "newQuestion"));
bot.use(createConversation(viewReportsConversation, "viewReports")); // <-- ДОБАВЛЕНО
bot.use(createConversation(absenceConversation, "absence"));

bot.use(createConversation(morningConversation, "morning"));
bot.use(createConversation(eveningConversation, "evening"));

// ОБНОВЛЁННЫЕ ТРИГГЕРЫ МЕНЮ (Добавлены Отчёты)
export const MENU_TRIGGERS = [
  "➕ Новая задача", "📂 Новый проект", "📋 Мои задачи", "❓ Помощь", "🆕 Новый вопрос", "📊 Отчёты",
  "/newtask", "/newproject", "/mytasks", "/myprojects", "/newquestion", "/reports", "/start", "/menu", "/pause", "/unpause", "/absence"
];

export function getMainMenuKeyboard(isAdmin: boolean) {
  const kb = new Keyboard()
    .text("➕ Новая задача").text("📂 Новый проект").row()
    .text("📋 Мои задачи").row()
    .text("❓ Помощь");
  
  if (isAdmin) {
    kb.row().text("🆕 Новый вопрос").text("📊 Отчёты");
  }
  
  return kb.resized();
}

bot.command("start", async (ctx) => {
  const token = ctx.match;
  
  if (!token) {
    const existingUser = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
    if (existingUser) {
      return ctx.reply("С возвращением! Вот меню 👇", { reply_markup: getMainMenuKeyboard(existingUser.isAdmin) });
    }
    return ctx.reply("Привет! Для использования бота нужна ссылка-приглашение.");
  }

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) return ctx.reply("Неверный или устаревший токен.");

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: ctx.from?.id, inviteToken: null },
  });

  await ctx.reply(`Отлично, ${user.name}! Твой Telegram привязан. Я буду писать тебе по расписанию.`, {
    reply_markup: getMainMenuKeyboard(updatedUser.isAdmin)
  });
});

bot.command("menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  await ctx.reply("Вот меню 👇", { reply_markup: getMainMenuKeyboard(user?.isAdmin ?? false) });
});

bot.hears("❓ Помощь", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  
  let helpText = "🤖 *Что я умею:*\n\n" +
    "➕ *Новая задача* — быстро добавить таск в проект\n" +
    "📂 *Новый проект* — создать проект и стать его участником\n" +
    "📋 *Мои задачи* — посмотреть открытые таски и изменить их статусы\n" +
    "📁 */myprojects* — список твоих проектов\n" +
    "🏖 */absence* — сообщить об отсутствии (выходной, отпуск, отойти по делам)\n" +
    "❌ */myabsences* — посмотреть и отменить свои активные отсутствия\n\n" +
    "А ещё я буду присылать опросы по расписанию, чтобы собирать отчёты для команды!";
    
  if (user?.isAdmin) {
    helpText += "\n\n👑 *Админу:*\n🆕 *Новый вопрос* — создать опрос прямо отсюда\n📊 *Отчёты* — сгенерировать отчёт по сотруднику.";
  }

  await ctx.reply(helpText, { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard(user?.isAdmin ?? false) });
});

// ДОБАВЛЕН ОБРАБОТЧИК /absence
bot.command("absence", async (ctx) => ctx.conversation.enter("absence"));

// === НОВАЯ КОМАНДА: МОИ ОТСУТСТВИЯ ===
bot.command("myabsences", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  if (!user) return;

  const absences = await prisma.absence.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { startDate: 'asc' }
  });

  const now = new Date();
  const todayStr = formatInTimeZone(now, user.timezone, 'yyyy-MM-dd');
  
  // Оставляем только те, которые еще не завершились
  const validAbsences = absences.filter(abs => {
    const endStr = formatInTimeZone(abs.endDate, user.timezone, 'yyyy-MM-dd');
    return endStr >= todayStr;
  });

  if (validAbsences.length === 0) {
    return ctx.reply("Активных отсутствий нет.");
  }

  await ctx.reply(" Твои активные отсутствия:");
  
  for (const abs of validAbsences) {
    const sDate = formatInTimeZone(abs.startDate, user.timezone, 'dd.MM.yyyy');
    const eDate = formatInTimeZone(abs.endDate, user.timezone, 'dd.MM.yyyy');
    
    let text = "";
    if (abs.type === "FULL_DAY") text = `На весь день ${sDate}`;
    else if (abs.type === "RANGE") text = `С ${sDate} по ${eDate}`;
    else text = `${sDate} с ${abs.startTime} до ${abs.endTime}`;

    if (abs.reason) text += `\nПричина: ${abs.reason}`;

    const kb = new InlineKeyboard().text("❌ Отменить", `absence_no_${abs.id}`);
    await ctx.reply(text, { reply_markup: kb });
  }
});

bot.hears("➕ Новая задача", async (ctx) => ctx.conversation.enter("newTask"));
bot.command("newtask", async (ctx) => ctx.conversation.enter("newTask"));

bot.hears("📂 Новый проект", async (ctx) => ctx.conversation.enter("newProject"));
bot.command("newproject", async (ctx) => ctx.conversation.enter("newProject"));

bot.hears("🆕 Новый вопрос", async (ctx) => ctx.conversation.enter("newQuestion"));
bot.command("newquestion", async (ctx) => ctx.conversation.enter("newQuestion"));

bot.hears("📊 Отчёты", async (ctx) => ctx.conversation.enter("viewReports"));
bot.command("reports", async (ctx) => ctx.conversation.enter("viewReports"));

bot.command("pause", async (ctx) => ctx.conversation.enter("pause"));
bot.command("unpause", async (ctx) => {
  const user = await prisma.user.update({ where: { telegramId: ctx.from!.id }, data: { pausedUntil: null } });
  await ctx.reply("✅ Пауза снята, снова на связи.", { reply_markup: getMainMenuKeyboard(user.isAdmin) });
});

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
    include: { project: true },
  });

  if (tasks.length === 0) {
    await ctx.reply("У тебя сейчас нет открытых задач 🎉");
    return;
  }

  const grouped = tasks.reduce((acc, task) => {
    const pName = task.project?.name ?? "Без проекта";
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(task);
    return acc;
  }, {} as Record<string, typeof tasks>);

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

bot.callbackQuery("start_morning", async (ctx) => {
  try { await ctx.answerCallbackQuery(); } catch (e) { console.log("Callback устарел:", e); }
  await ctx.deleteMessage().catch(() => {});
  await ctx.conversation.enter("morning");
});

bot.callbackQuery("start_evening", async (ctx) => {
  try { await ctx.answerCallbackQuery(); } catch (e) { console.log("Callback устарел:", e); }
  await ctx.deleteMessage().catch(() => {});
  await ctx.conversation.enter("evening");
});

bot.callbackQuery(/^ans_custom_(.+)$/, async (ctx) => {
  ctx.session.customQuestionId = ctx.match[1];
  if (ctx.callbackQuery.message?.message_id) {
    ctx.session.promptMessageId = ctx.callbackQuery.message.message_id;
  }
  try { await ctx.answerCallbackQuery(); } catch (e) { console.log("Callback устарел:", e); }
  await ctx.conversation.enter("customQuestion");
});

bot.callbackQuery(/^ack_task_.+/, async (ctx) => {
  const taskId = ctx.callbackQuery.data.replace("ack_task_", "");
  try {
    await prisma.task.update({ where: { id: taskId }, data: { acknowledgedAt: new Date() } });
    try { await ctx.answerCallbackQuery("Принято!"); } catch (e) { console.log("Callback устарел:", e); }
    
    const text = ctx.callbackQuery.message?.text || "📌 Задача";
    const dateStr = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    await ctx.editMessageText(`${text}\n\n✅ Принято ${dateStr}`);
  } catch (error) {
    try { await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true }); } catch (e) {}
  }
});

bot.callbackQuery(/^delete_task_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  try {
    await prisma.task.delete({ where: { id } });
    try { await ctx.answerCallbackQuery("Задача удалена"); } catch (e) {}
    await ctx.deleteMessage(); 
  } catch (error) {
    try { await ctx.answerCallbackQuery({ text: "Ошибка удаления", show_alert: true }); } catch (e) {}
  }
});

bot.callbackQuery(/^edit_task_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  ctx.session.editTaskId = id;
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.conversation.enter("editTask");
});

bot.callbackQuery(/^del_project_(.+)$/, async (ctx) => {
  const projectId = ctx.match[1];
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  
  if (!project) { 
    try { await ctx.answerCallbackQuery("Проект не найден"); } catch (e) {} 
    return;
  }
  
  const ageMs = Date.now() - project.createdAt.getTime();
  
  if (ageMs > 60 * 60 * 1000) {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    
    const reqDelKb = new InlineKeyboard().text("📨 Запросить удаление у администратора", `reqdel_project_${projectId}`);
    await ctx.editMessageReplyMarkup({ reply_markup: reqDelKb });
    
    return ctx.reply("⏰ Прошёл час с создания — самостоятельно удалить уже нельзя. Можешь отправить запрос администратору.");
  }
  
  try {
    await prisma.project.delete({ where: { id: projectId } });
    try { await ctx.answerCallbackQuery("Удалено"); } catch (e) {}
    await ctx.editMessageText(`🗑 Проект «${project.name}» удалён.`);
  } catch (e) {
    try { await ctx.answerCallbackQuery(); } catch (err) {}
    await ctx.reply("Не получилось удалить — по проекту уже есть задачи. Обратись к администратору.");
  }
});

bot.callbackQuery(/^reqdel_project_(.+)$/, async (ctx) => {
  const projectId = ctx.match[1];
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  
  if (!project) { 
    try { await ctx.answerCallbackQuery("Проект не найден"); } catch (e) {} 
    return;
  }
  
  const requester = await prisma.user.findUnique({ where: { telegramId: ctx.from!.id } });
  const admins = await prisma.user.findMany({ where: { isAdmin: true, isActive: true, telegramId: { not: null } } });
  
  for (const admin of admins) {
    await sendTelegramMessage(admin.telegramId!, 
      `🗑 *Запрос на удаление проекта*\n\nПользователь: ${requester?.name ?? "неизвестно"}\nПроект: «${project.name}»\nСоздан: ${project.createdAt.toLocaleString("ru-RU")}\n\nУдалить можно через админку → Проекты.`);
  }
  
  try { await ctx.answerCallbackQuery("Запрос отправлен администратору"); } catch (e) {}
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
});



// === ФУНКЦИЯ ОТМЕНЫ ОТСУТСТВИЯ ===
async function cancelAbsence(absenceId: string, ctx: MyContext) {
  const absence = await prisma.absence.update({ 
    where: { id: absenceId }, 
    data: { status: "CANCELLED" }, 
    include: { user: true } 
  });
  
  const otherActive = await prisma.absence.findFirst({ 
    where: {
      userId: absence.userId, 
      status: "ACTIVE", 
      id: { not: absence.id },
      type: { in: ["FULL_DAY", "RANGE"] }
    }
  });
  
  if (!otherActive) {
    await prisma.user.update({ 
      where: { id: absence.userId }, 
      data: { pausedUntil: null } 
    });
  }
  
  try { await ctx.answerCallbackQuery("Понял, снова на связи."); } catch(e){}
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply("✅ Отменил отсутствие, буду снова писать по расписанию.");
  
  const admins = await prisma.user.findMany({ 
    where: { isAdmin: true, isActive: true, telegramId: { not: null } } 
  });
  
  for (const admin of admins) {
    await sendTelegramMessage(admin.telegramId!, 
      `↩️ *${absence.user.name}* отменил(а) ранее заявленное отсутствие — уже на связи.`);
  }
}

// === НОВЫЕ ОБРАБОТЧИКИ CALLBACK_QUERY (Подтверждение отсутствия) ===
bot.callbackQuery(/^absence_yes_(.+)$/, async (ctx) => {
  await prisma.absence.update({ 
    where: { id: ctx.match[1] }, 
    data: { lastReconfirmedAt: new Date() } 
  });
  try { await ctx.answerCallbackQuery("Ок, продолжаем!"); } catch(e){}
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

bot.callbackQuery(/^absence_no_(.+)$/, async (ctx) => {
  await cancelAbsence(ctx.match[1], ctx);
});

bot.on("message:text", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  await ctx.reply(
    "Не понял тебя 🙂\n\nВоспользуйся кнопками внизу экрана или командами:\n/newtask — добавить задачу\n/newproject — создать проект\n/mytasks — посмотреть список задач\n\nЕсли ждёшь чек-ин — дождись сообщения от меня по расписанию.",
    { reply_markup: getMainMenuKeyboard(user?.isAdmin ?? false) }
  );
});

bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot);
  },
});

export { prisma };