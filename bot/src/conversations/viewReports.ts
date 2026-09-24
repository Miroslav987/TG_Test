import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { generateEmployeeReport } from "@standup/shared";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";

export async function viewReportsConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  
  if (!user?.isAdmin) {
    await ctx.reply("⛔ Эта команда доступна только администраторам.");
    return;
  }

  // 1. Выбор сотрудника
  const activeUsers = await conversation.external(() => 
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
  );

  if (activeUsers.length === 0) {
    await ctx.reply("В системе пока нет активных сотрудников.");
    return;
  }

  const userKb = new InlineKeyboard();
  activeUsers.forEach((u: any) => userKb.text(u.name, `rep_user_${u.id}`).row());

  const userMsg = await ctx.reply("Выбери сотрудника:", { reply_markup: userKb });
  const userCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

  if (userCtx.message?.text && MENU_TRIGGERS.includes(userCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  let employeeId = "";
  let employeeName = "";

  if (userCtx.has("callback_query:data")) {
    employeeId = userCtx.callbackQuery.data.replace("rep_user_", "");
    employeeName = activeUsers.find((u: any) => u.id === employeeId)?.name || "Сотрудник";
    try { await userCtx.answerCallbackQuery(); } catch (e) {}
  } else {
    await ctx.reply("Отменено. Пожалуйста, используй кнопки.");
    return;
  }

  await ctx.api.deleteMessage(ctx.chat!.id, userMsg.message_id).catch(() => {});

  // 2. Выбор периода
  const periodKb = new InlineKeyboard()
    .text("Сегодня", "today").row()
    .text("Эта неделя", "week").row()
    .text("Этот месяц", "month");

  const periodMsg = await ctx.reply(`Отчёт по ${employeeName} — за какой период?`, { reply_markup: periodKb });
  const periodCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

  if (periodCtx.message?.text && MENU_TRIGGERS.includes(periodCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  let periodChoice = "";
  if (periodCtx.has("callback_query:data")) {
    periodChoice = periodCtx.callbackQuery.data;
    try { await periodCtx.answerCallbackQuery(); } catch (e) {}
  } else {
    await ctx.reply("Отменено. Пожалуйста, используй кнопки.");
    return;
  }

  // 3. Генерация отчёта
  await ctx.api.editMessageText(
    ctx.chat!.id, 
    periodMsg.message_id, 
    "⏳ Генерирую отчёт, анализирую чек-ины и задачи... Это может занять несколько секунд."
  ).catch(() => {});

  const now = new Date();
  let startDate: Date;
  const endDate = now;

  if (periodChoice === "week") {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
  } else if (periodChoice === "month") {
    startDate = startOfMonth(now);
  } else {
    startDate = startOfDay(now);
  }

  const content = await conversation.external(() => 
    generateEmployeeReport(employeeId, startDate, endDate)
  );

  // Сохраняем в базу (для веб-админки)
  await conversation.external(() => 
    prisma.report.create({ data: { userId: employeeId, content } })
  );

  // 4. Отправка результата с разбивкой на части (лимит Telegram 4096 символов)
  const MAX_LENGTH = 4000;
  const chunks = [];
  for (let i = 0; i < content.length; i += MAX_LENGTH) {
    chunks.push(content.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch (e) {
      console.warn("Ошибка парсинга Markdown от Gemini, отправляю как простой текст:", e);
      // Если Gemini прислал сломанный Markdown (например, незакрытые **), шлём без форматирования
      await ctx.reply(chunk); 
    }
  }

  // Убираем сообщение "Генерирую..." для чистоты
  await ctx.api.deleteMessage(ctx.chat!.id, periodMsg.message_id).catch(() => {});
}