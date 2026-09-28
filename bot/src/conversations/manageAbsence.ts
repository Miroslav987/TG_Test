import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { sendTelegramMessage } from "@standup/shared";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { recalculateUserPause, formatAbsence, parseAbsenceWithGemini, CANCEL_WORDS } from "../utils/absences";

export async function manageAbsenceConversation(
  conversation: Conversation<MyContext>, 
  ctx: MyContext,
  data: { action: string, absenceId: string, smartText?: string }
) {
  const { action, absenceId, smartText } = data;
  
  const absence = await conversation.external(() => 
    prisma.absence.findUnique({ where: { id: absenceId }, include: { user: true } })
  );

  if (!absence || absence.status !== "ACTIVE") {
    await ctx.reply("Это меню уже неактуально (отсутствие удалено или завершено).");
    return;
  }

  const oldDesc = formatAbsence(absence, "Asia/Bishkek");
  const todayStr = formatInTimeZone(new Date(), "Asia/Bishkek", "yyyy-MM-dd");

  // === УДАЛЕНИЕ ===
  if (action === "del") {
    const kb = new InlineKeyboard().text("✅ Удалить", "yes").text("❌ Отмена", "no");
    const msg = await ctx.reply(`Точно удалить отсутствие (${oldDesc})?`, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(["yes", "no"]);
    try { await resp.answerCallbackQuery(); } catch(e){}
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});

    if (resp.match === "yes") {
      await conversation.external(async () => {
        await prisma.absence.update({ where: { id: absence.id }, data: { status: "CANCELLED" } });
        await recalculateUserPause(absence.userId);
      });
      await ctx.reply("✅ Отсутствие удалено, возвращаю расписание.");
      const admins = await conversation.external(() => prisma.user.findMany({ where: { isAdmin: true, isActive: true, telegramId: { not: null } } }));
      for (const admin of admins) {
        await conversation.external(() => sendTelegramMessage(admin.telegramId!, `↩️ *${absence.user.name}* отменил(а) ранее заявленное отсутствие (было: ${oldDesc}).`));
      }
    } else {
      await ctx.reply("❌ Отменено.");
    }
    return;
  }

  // === ПЕРЕНОС ИЛИ ИЗМЕНЕНИЕ ===
  let userInput = smartText;

  if (!userInput) {
    if (action === "resched") {
      const kb = new InlineKeyboard().text("+1 день", "shift_1d").text("+1 неделя", "shift_1w").row()
        .text("Указать даты", "custom").row().text("❌ Отмена", "cancel");
      const msg = await ctx.reply(`На какие даты перенести?\nБыло: ${oldDesc}`, { reply_markup: kb });
      const resp = await conversation.waitForCallbackQuery(["shift_1d", "shift_1w", "custom", "cancel"]);
      try { await resp.answerCallbackQuery(); } catch(e){}
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});

      if (resp.match === "cancel") { await ctx.reply("❌ Отменено."); return; }
      if (resp.match === "shift_1d") userInput = "сдвинь на 1 день вперёд";
      if (resp.match === "shift_1w") userInput = "сдвинь на 1 неделю вперёд";
      if (resp.match === "custom") {
        await ctx.reply("Напиши новые даты (или напиши «отмена»):");
        const txt = await conversation.waitFor("message:text");
        if (MENU_TRIGGERS.includes(txt.message!.text) || CANCEL_WORDS.includes(txt.message!.text.toLowerCase())) { await ctx.reply("❌ Отменено."); return; }
        userInput = txt.message!.text;
      }
    } else if (action === "edit") {
      await ctx.reply("Напиши, что изменить (например, «добавить время с 14 до 16» или «на весь день»):\n(или напиши «отмена»)");
      const txt = await conversation.waitFor("message:text");
      if (MENU_TRIGGERS.includes(txt.message!.text) || CANCEL_WORDS.includes(txt.message!.text.toLowerCase())) { await ctx.reply("❌ Отменено."); return; }
      userInput = txt.message!.text;
    }
  }

  // Парсинг новых данных через Gemini
  const msgWait = await ctx.reply("⏳ Применяю изменения...");
  let parsedData: any = null;
  try {
    const rawAbsence = { type: absence.type, startDate: formatInTimeZone(absence.startDate, "Asia/Bishkek", 'yyyy-MM-dd'), endDate: formatInTimeZone(absence.endDate, "Asia/Bishkek", 'yyyy-MM-dd'), startTime: absence.startTime, endTime: absence.endTime, reason: absence.reason };
    parsedData = await conversation.external(() => parseAbsenceWithGemini(userInput!, todayStr, rawAbsence));
  } catch (e) {
    await ctx.api.deleteMessage(ctx.chat!.id, msgWait.message_id).catch(() => {});
    await ctx.reply("Не понял, как применить изменения. Попробуй ещё раз.");
    return;
  }
  await ctx.api.deleteMessage(ctx.chat!.id, msgWait.message_id).catch(() => {});

  if (!parsedData || parsedData.error) {
    await ctx.reply("Не понял, как применить изменения. Попробуй ещё раз.");
    return;
  }

  if (parsedData.startDate < todayStr) {
    await ctx.reply("Эта дата уже прошла. Перенос отменён.");
    return;
  }

  const sDate = fromZonedTime(`${parsedData.startDate} 00:00:00`, "Asia/Bishkek");
  const eDate = fromZonedTime(`${parsedData.endDate} 00:00:00`, "Asia/Bishkek");
  const newDesc = formatAbsence({ ...parsedData, startDate: sDate, endDate: eDate }, "Asia/Bishkek");

  const confKb = new InlineKeyboard().text("✅ Перенести", "yes").text("❌ Отмена", "no");
  const confMsg = await ctx.reply(`Было: ${oldDesc}\nСтанет: ${newDesc}`, { reply_markup: confKb });
  
  const cResp = await conversation.waitForCallbackQuery(["yes", "no"]);
  try { await cResp.answerCallbackQuery(); } catch(e){}
  await ctx.api.deleteMessage(ctx.chat!.id, confMsg.message_id).catch(() => {});

  if (cResp.match === "no") {
    await ctx.reply("❌ Отменено.");
    return;
  }

  await conversation.external(async () => {
    await prisma.absence.update({
      where: { id: absence.id },
      data: { type: parsedData.type, startDate: sDate, endDate: eDate, startTime: parsedData.startTime, endTime: parsedData.endTime }
    });
    await recalculateUserPause(absence.userId);
  });

  await ctx.reply(`Перенёс: ${newDesc} 👌`);

  const admins = await conversation.external(() => prisma.user.findMany({ where: { isAdmin: true, isActive: true, telegramId: { not: null } } }));
  for (const admin of admins) {
    await conversation.external(() => sendTelegramMessage(admin.telegramId!, `🏖 *${absence.user.name}* изменил(а) отсутствие.\nБыло: ${oldDesc}\nСтало: ${newDesc}`));
  }
}