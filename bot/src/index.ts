import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), "../.env") });

import { Bot, session, Context, Keyboard, InlineKeyboard } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { formatInTimeZone } from "date-fns-tz";
import { startScheduler } from "./scheduler";
import { newTaskConversation } from "./conversations/newTask";
import { newProjectConversation } from "./conversations/newProject";
import { editTaskConversation } from "./conversations/editTask";
import { customQuestionConversation } from "./conversations/customQuestion";
import { pauseConversation } from "./conversations/pause";
import { newQuestionConversation } from "./conversations/newQuestion";
import { viewReportsConversation } from "./conversations/viewReports";
import { eveningConversation } from "./conversations/evening";
import { morningConversation } from "./conversations/morning";
import { prisma, sendTelegramMessage } from "@standup/shared";
import { absenceConversation } from "./conversations/absence";
import { assignTaskConversation } from "./conversations/assignTask";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { manageAbsenceConversation } from "./conversations/manageAbsence";
import { recalculateUserPause, formatAbsence } from "./utils/absences";

export type MyContext = Context & { 
  session: { 
    customQuestionId?: string; 
    promptMessageId?: number; 
    intentText?: string;
    [key: string]: any;
  } 
}; 

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(newTaskConversation, "newTask"));
bot.use(createConversation(newProjectConversation, "newProject"));
bot.use(createConversation(editTaskConversation, "editTask"));
bot.use(createConversation(customQuestionConversation, "customQuestion"));
bot.use(createConversation(pauseConversation, "pause"));
bot.use(createConversation(newQuestionConversation, "newQuestion"));
bot.use(createConversation(viewReportsConversation, "viewReports"));
bot.use(createConversation(absenceConversation, "absence"));
bot.use(createConversation(morningConversation, "morning"));
bot.use(createConversation(eveningConversation, "evening"));
bot.use(createConversation(assignTaskConversation, "assignTask"));
bot.use(createConversation(manageAbsenceConversation, "manageAbsence"));

export const MENU_TRIGGERS = [
  "➕ Новая задача", "📂 Новый проект", "📋 Мои задачи", "❓ Помощь", "🆕 Новый вопрос", "📊 Отчёты", "📤 Назначить задачу", "🙋 Мои отсутствия",
  "/newtask", "/newproject", "/mytasks", "/myprojects", "/newquestion", "/reports", "/assign", "/absences", "/start", "/menu", "/pause", "/unpause", "/absence"
];

export function getMainMenuKeyboard(isAdmin: boolean) {
  const kb = new Keyboard()
    .text("➕ Новая задача").text("📂 Новый проект").row()
    .text("📋 Мои задачи").text("🙋 Мои отсутствия").row()
    .text("❓ Помощь");
  
  if (isAdmin) {
    kb.row().text("🆕 Новый вопрос").text("📊 Отчёты");
    kb.row().text("📤 Назначить задачу");
  }
  
  return kb.resized();
}

bot.command("start", async (ctx) => {
  const token = ctx.match;
  
  if (!token) {
    const existingUser = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
    if (existingUser) return ctx.reply("С возвращением! Вот меню 👇", { reply_markup: getMainMenuKeyboard(existingUser.isAdmin) });
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
    "🙋 *Мои отсутствия* — посмотреть и изменить отсутствия\n\n" +
    "А ещё я буду присылать опросы по расписанию, чтобы собирать отчёты для команды!";
    
  if (user?.isAdmin) {
    helpText += "\n\n👑 *Админу:*\n🆕 *Новый вопрос* — создать опрос прямо отсюда\n📊 *Отчёты* — сгенерировать отчёт по сотруднику\n📤 *Назначить задачу* — поручить таск коллеге.";
  }

  await ctx.reply(helpText, { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard(user?.isAdmin ?? false) });
});

bot.command("absence", async (ctx) => ctx.conversation.enter("absence"));

const myAbsencesHandler = async (ctx: MyContext) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  if (!user) return;

  const todayStr = formatInTimeZone(new Date(), user.timezone, 'yyyy-MM-dd');
  const absences = await prisma.absence.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { startDate: 'asc' }
  });

  const validAbsences = absences.filter(abs => {
    const endStr = formatInTimeZone(abs.endDate, user.timezone, 'yyyy-MM-dd');
    return endStr >= todayStr;
  });

  if (validAbsences.length === 0) {
    return ctx.reply("Отсутствий нет. Напиши, например: завтра выходной");
  }

  await ctx.reply("🙋 Твои активные отсутствия:");
  
  for (const abs of validAbsences) {
    const text = formatAbsence(abs, user.timezone) + (abs.reason ? `\nПричина: ${abs.reason}` : "");
    const kb = new InlineKeyboard()
      .text("📅 Перенести", `abs_resched_${abs.id}`)
      .text("✏️ Изменить", `abs_edit_${abs.id}`).row()
      .text("🗑 Удалить", `abs_del_${abs.id}`);
    await ctx.reply(text, { reply_markup: kb });
  }
};
bot.hears("🙋 Мои отсутствия", myAbsencesHandler);
bot.command("absences", myAbsencesHandler);

const myProjectsHandler = async (ctx: MyContext) => {
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
};
bot.command("myprojects", myProjectsHandler);

const myTasksHandler = async (ctx: MyContext) => {
  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  if (!user) return;

  const tasks = await prisma.task.findMany({
    where: { 
      status: { not: "DONE" },
      OR: [
        { assigneeId: user.id },
        { assigneeId: null, createdById: user.id }
      ]
    },
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

bot.hears("➕ Новая задача", async (ctx) => ctx.conversation.enter("newTask"));
bot.command("newtask", async (ctx) => ctx.conversation.enter("newTask"));
bot.hears("📂 Новый проект", async (ctx) => ctx.conversation.enter("newProject"));
bot.command("newproject", async (ctx) => ctx.conversation.enter("newProject"));
bot.hears("🆕 Новый вопрос", async (ctx) => ctx.conversation.enter("newQuestion"));
bot.command("newquestion", async (ctx) => ctx.conversation.enter("newQuestion"));
bot.hears("📊 Отчёты", async (ctx) => ctx.conversation.enter("viewReports"));
bot.command("reports", async (ctx) => ctx.conversation.enter("viewReports"));
bot.hears("📤 Назначить задачу", async (ctx) => ctx.conversation.enter("assignTask"));
bot.command("assign", async (ctx) => ctx.conversation.enter("assignTask"));
bot.command("pause", async (ctx) => ctx.conversation.enter("pause"));
bot.command("unpause", async (ctx) => {
  const user = await prisma.user.update({ where: { telegramId: ctx.from!.id }, data: { pausedUntil: null } });
  await ctx.reply("✅ Пауза снята, снова на связи.", { reply_markup: getMainMenuKeyboard(user.isAdmin) });
});

bot.callbackQuery("start_morning", async (ctx) => {
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.deleteMessage().catch(() => {});
  await ctx.conversation.enter("morning");
});

bot.callbackQuery("start_evening", async (ctx) => {
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.deleteMessage().catch(() => {});
  await ctx.conversation.enter("evening");
});

bot.callbackQuery(/^ans_custom_(.+)$/, async (ctx) => {
  ctx.session.customQuestionId = ctx.match[1];
  if (ctx.callbackQuery.message?.message_id) ctx.session.promptMessageId = ctx.callbackQuery.message.message_id;
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.conversation.enter("customQuestion");
});

bot.callbackQuery(/^ack_task_.+/, async (ctx) => {
  const taskId = ctx.callbackQuery.data.replace("ack_task_", "");
  try {
    await prisma.task.update({ where: { id: taskId }, data: { acknowledgedAt: new Date() } });
    try { await ctx.answerCallbackQuery("Принято!"); } catch (e) {}
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
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.conversation.enter("editTask", id);
});

bot.callbackQuery(/^del_project_(.+)$/, async (ctx) => { /* Без изменений */ });
bot.callbackQuery(/^reqdel_project_(.+)$/, async (ctx) => { /* Без изменений */ });

bot.callbackQuery(/^abs_(resched|edit|del)_(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  const absenceId = ctx.match[2];
  try { await ctx.answerCallbackQuery(); } catch(e){}
  
  const absence = await prisma.absence.findUnique({ where: { id: absenceId } });
  if (!absence || absence.status !== "ACTIVE") {
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply("Это меню уже неактуально.");
    return;
  }
  
  await ctx.conversation.enter("manageAbsence", { action, absenceId });
});

async function cancelAbsence(absenceId: string, ctx: MyContext) {
  const absence = await prisma.absence.update({ where: { id: absenceId }, data: { status: "CANCELLED" }, include: { user: true } });
  await recalculateUserPause(absence.userId);
  try { await ctx.answerCallbackQuery("Понял, снова на связи."); } catch(e){}
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply("✅ Отменил отсутствие, буду снова писать по расписанию.");
  const admins = await prisma.user.findMany({ where: { isAdmin: true, isActive: true, telegramId: { not: null } } });
  for (const admin of admins) {
    await sendTelegramMessage(admin.telegramId!, `↩️ *${absence.user.name}* отменил(а) ранее заявленное отсутствие — уже на связи.`);
  }
}

bot.callbackQuery(/^absence_yes_(.+)$/, async (ctx) => {
  await prisma.absence.update({ where: { id: ctx.match[1] }, data: { lastReconfirmedAt: new Date() } });
  try { await ctx.answerCallbackQuery("Ок, продолжаем!"); } catch(e){}
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

bot.callbackQuery(/^absence_no_(.+)$/, async (ctx) => {
  await cancelAbsence(ctx.match[1], ctx);
});

// === ОБРАБОТЧИКИ НАМЕРЕНИЙ ИЗ GEMINI ===
bot.callbackQuery(/^intent_yes_(.+)$/, async (ctx) => {
  const intent = ctx.match[1];
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.deleteMessage().catch(() => {});

  switch (intent) {
    case "NEW_TASK": await ctx.conversation.enter("newTask"); break;
    case "NEW_PROJECT": await ctx.conversation.enter("newProject"); break;
    case "MY_TASKS": await myTasksHandler(ctx); break;
    case "MY_PROJECTS": await myProjectsHandler(ctx); break;
    case "NEW_ABSENCE": await ctx.conversation.enter("absence"); break;
    case "VIEW_REPORTS": await ctx.conversation.enter("viewReports"); break; // <-- ДОБАВЛЕНО
    case "MODIFY_ABSENCE":
    case "CANCEL_ABSENCE":
      const action = intent === "CANCEL_ABSENCE" ? "del" : "smart";
      const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
      const todayStr = formatInTimeZone(new Date(), user!.timezone, 'yyyy-MM-dd');
      const activeAbsences = (await prisma.absence.findMany({ where: { userId: user!.id, status: "ACTIVE" } }))
        .filter(abs => formatInTimeZone(abs.endDate, user!.timezone, 'yyyy-MM-dd') >= todayStr);
      
      if (activeAbsences.length === 0) {
        await ctx.reply("У тебя нет активных отсутствий.");
      } else if (activeAbsences.length === 1) {
        await ctx.conversation.enter("manageAbsence", { action, absenceId: activeAbsences[0].id, smartText: ctx.session.intentText });
      } else {
        await ctx.reply("Какое отсутствие хочешь изменить/отменить?");
        for (const abs of activeAbsences) {
          const kb = new InlineKeyboard().text("Выбрать это", `abs_${action}_${abs.id}`);
          await ctx.reply(formatAbsence(abs, user!.timezone), { reply_markup: kb });
        }
      }
      break;
  }
});

bot.callbackQuery("intent_no", async (ctx) => {
  try { await ctx.answerCallbackQuery(); } catch (e) {}
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Хорошо, воспользуйся кнопками внизу или напиши /menu.");
});

bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text.trim();
  ctx.session.intentText = userText; 

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ДОБАВЛЕН VIEW_REPORTS В ПРОМТ
    const prompt = `Определи намерение пользователя в сообщении ниже. Верни СТРОГО одно слово без пояснений: NEW_TASK (хочет создать задачу), NEW_PROJECT (создать проект), MY_TASKS (посмотреть свои задачи), MY_PROJECTS (посмотреть свои проекты), NEW_ABSENCE (сообщает о НОВОМ отсутствии), MODIFY_ABSENCE (перенести/изменить СУЩЕСТВУЮЩЕЕ отсутствие), CANCEL_ABSENCE (отменить отсутствие), VIEW_REPORTS (хочет посмотреть отчёт/сводку по сотруднику), HELP (не понятно / другое). Сообщение: «${userText}»`;

    const result = await model.generateContent(prompt);
    const intent = result.response.text().trim().toUpperCase();

    // ДОБАВЛЕН VIEW_REPORTS В КАРТУ
    const intentMap: Record<string, string> = {
      "NEW_TASK": "создать задачу", "NEW_PROJECT": "создать проект", "MY_TASKS": "посмотреть свои задачи",
      "MY_PROJECTS": "посмотреть свои проекты", "NEW_ABSENCE": "сообщить о новом отсутствии",
      "MODIFY_ABSENCE": "изменить даты/время отсутствия", "CANCEL_ABSENCE": "отменить отсутствие",
      "VIEW_REPORTS": "посмотреть отчёт по сотруднику"
    };

    if (intentMap[intent]) {
      const kb = new InlineKeyboard().text("✅ Да", `intent_yes_${intent}`).row().text("❌ Нет, другое", `intent_no`);
      await ctx.reply(`Похоже, ты хочешь ${intentMap[intent]}. Верно?`, { reply_markup: kb });
      return;
    }
  } catch (error) {
    console.warn("Ошибка распознавания намерений:", error);
  }

  const user = await prisma.user.findUnique({ where: { telegramId: ctx.from?.id } });
  await ctx.reply("Не понял тебя 🙂\nВоспользуйся кнопками внизу экрана или командами.", { reply_markup: getMainMenuKeyboard(user?.isAdmin ?? false) });
});

bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot);
  },
});

export { prisma };