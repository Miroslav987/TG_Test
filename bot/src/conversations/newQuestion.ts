import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";
import { formatInTimeZone } from "date-fns-tz";

export async function newQuestionConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  
  if (!user?.isAdmin) {
    await ctx.reply("⛔ Эта команда доступна только администраторам.");
    return;
  }

  // 1. Текст вопроса
  await ctx.reply("Текст вопроса?\n(или напиши /menu, чтобы отменить)");
  const textCtx = await conversation.waitFor("message:text");
  if (MENU_TRIGGERS.includes(textCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }
  const text = textCtx.message.text.trim();

  // 2. Тип ответа
  const typeKb = new InlineKeyboard()
    .text("Текст", "TEXT").text("Число", "NUMBER").row()
    .text("Да-Нет", "YES_NO").text("Один вариант", "SELECT").row()
    .text("Несколько вариантов", "MULTI_SELECT").row()
    .text("❌ Отмена", "cancel_flow");
    
  const typeMsg = await ctx.reply("Тип ответа?", { reply_markup: typeKb });
  const typeCtx = await conversation.waitForCallbackQuery(["TEXT", "NUMBER", "YES_NO", "SELECT", "MULTI_SELECT", "cancel_flow"]);
  const type = typeCtx.match;
  try { await typeCtx.answerCallbackQuery(); } catch (e) {}
  await ctx.api.deleteMessage(ctx.chat!.id, typeMsg.message_id).catch(() => {});

  if (type === "cancel_flow") {
    await ctx.reply("❌ Отменено.");
    return;
  }

  let options: string[] = [];
  if (type === "SELECT" || type === "MULTI_SELECT") {
    await ctx.reply("Введите варианты ответа через запятую:\n(или напиши /menu, чтобы отменить)");
    const optCtx = await conversation.waitFor("message:text");
    if (MENU_TRIGGERS.includes(optCtx.message.text)) {
      await ctx.reply("Отменил текущее действие.");
      return;
    }
    options = optCtx.message.text.split(",").map((s: string) => s.trim()).filter(Boolean);
  }

  // 3. Расписание
  const schedKb = new InlineKeyboard()
    .text("Сейчас (разово)", "EXACT_TIME").row()
    .text("Каждый день в это же время", "DAILY").row()
    .text("Каждую неделю в этот день и время", "WEEKLY").row()
    .text("❌ Отмена", "cancel_flow");
    
  const schedMsg = await ctx.reply("Когда отправлять?", { reply_markup: schedKb });
  const schedCtx = await conversation.waitForCallbackQuery(["EXACT_TIME", "DAILY", "WEEKLY", "cancel_flow"]);
  const scheduleChoice = schedCtx.match;
  try { await schedCtx.answerCallbackQuery(); } catch (e) {}
  await ctx.api.deleteMessage(ctx.chat!.id, schedMsg.message_id).catch(() => {});

  if (scheduleChoice === "cancel_flow") {
    await ctx.reply("❌ Отменено.");
    return;
  }

  let scheduleType: "EXACT_TIME" | "RECURRING" = "RECURRING";
  let exactTime: Date | null = null;
  let recurrenceInterval: "DAILY" | "WEEKLY" | null = null;
  let recurrenceTime: string | null = null;
  let recurrenceDay: number | null = null;

  if (scheduleChoice === "EXACT_TIME") {
    scheduleType = "EXACT_TIME";
    exactTime = new Date();
  } else {
    scheduleType = "RECURRING";
    recurrenceInterval = scheduleChoice as "DAILY" | "WEEKLY";
    
    await ctx.reply("Во сколько? (например 09:00)\n(или напиши /menu, чтобы отменить)");
    const timeCtx = await conversation.waitFor("message:text");
    if (MENU_TRIGGERS.includes(timeCtx.message.text)) {
      await ctx.reply("Отменил текущее действие.");
      return;
    }
    recurrenceTime = timeCtx.message.text.trim();
    
    if (recurrenceInterval === "WEEKLY") {
      recurrenceDay = parseInt(formatInTimeZone(new Date(), "Asia/Bishkek", "i"));
    }
  }

  // 4. Аудитория
  const targetKb = new InlineKeyboard()
    .text("Всем", "GENERAL").text("По роли", "ROLE").text("Одному человеку", "USER").row()
    .text("❌ Отмена", "cancel_flow");
    
  const targetMsg = await ctx.reply("Кому адресовать?", { reply_markup: targetKb });
  const targetCtx = await conversation.waitForCallbackQuery(["GENERAL", "ROLE", "USER", "cancel_flow"]);
  const targetTypeStr = targetCtx.match;
  try { await targetCtx.answerCallbackQuery(); } catch (e) {}
  await ctx.api.deleteMessage(ctx.chat!.id, targetMsg.message_id).catch(() => {});

  if (targetTypeStr === "cancel_flow") {
    await ctx.reply("❌ Отменено.");
    return;
  }

  let targetRoleId: string | null = null;
  let targetUserId: string | null = null;

  if (targetTypeStr === "ROLE") {
    const roles = await conversation.external(() => prisma.role.findMany());
    const rKb = new InlineKeyboard();
    roles.forEach((r: any) => rKb.text(r.name, `role_${r.id}`).row());
    rKb.text("❌ Отмена", "cancel_flow");
    
    const roleMsg = await ctx.reply("Выберите роль:", { reply_markup: rKb });
    const rCtx = await conversation.waitForCallbackQuery(/role_.+|cancel_flow/);
    const data = rCtx.callbackQuery!.data;
    try { await rCtx.answerCallbackQuery(); } catch (e) {}
    await ctx.api.deleteMessage(ctx.chat!.id, roleMsg.message_id).catch(() => {});

    if (data === "cancel_flow") {
      await ctx.reply("❌ Отменено.");
      return;
    }
    targetRoleId = data.replace("role_", "");
  } 
  else if (targetTypeStr === "USER") {
    const users = await conversation.external(() => prisma.user.findMany({ where: { isActive: true } }));
    const uKb = new InlineKeyboard();
    users.forEach((u: any) => uKb.text(u.name, `user_${u.id}`).row());
    uKb.text("❌ Отмена", "cancel_flow");
    
    const userMsg = await ctx.reply("Выберите сотрудника:", { reply_markup: uKb });
    const uCtx = await conversation.waitForCallbackQuery(/user_.+|cancel_flow/);
    const data = uCtx.callbackQuery!.data;
    try { await uCtx.answerCallbackQuery(); } catch (e) {}
    await ctx.api.deleteMessage(ctx.chat!.id, userMsg.message_id).catch(() => {});

    if (data === "cancel_flow") {
      await ctx.reply("❌ Отменено.");
      return;
    }
    targetUserId = data.replace("user_", "");
  }

  // 5. Флаги и параметры
  const askYesNo = async (question: string) => {
    const kb = new InlineKeyboard().text("Да", "yes").text("Нет", "no").row().text("❌ Отмена", "cancel_flow");
    const msg = await ctx.reply(question, { reply_markup: kb });
    const r = await conversation.waitForCallbackQuery(["yes", "no", "cancel_flow"]);
    try { await r.answerCallbackQuery(); } catch (e) {}
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    return r.match;
  };

  const isRequiredResp = await askYesNo("Обязательный вопрос?");
  if (isRequiredResp === "cancel_flow") { await ctx.reply("❌ Отменено."); return; }
  const isRequired = isRequiredResp === "yes";

  const remindResp = await askYesNo("Напоминать, пока не ответит?");
  if (remindResp === "cancel_flow") { await ctx.reply("❌ Отменено."); return; }
  const remindUntilAnswered = remindResp === "yes";

  const inclResp = await askYesNo("Включать в сводные отчёты?");
  if (inclResp === "cancel_flow") { await ctx.reply("❌ Отменено."); return; }
  const includeInReport = inclResp === "yes";

  // 6. Сохранение
  await conversation.external(() => 
    prisma.question.create({
      data: {
        text, type: type as any, options, scheduleType, exactTime, recurrenceInterval, recurrenceTime, 
        recurrenceDay, targetRoleId, targetUserId, isRequired, remindUntilAnswered, includeInReport
      }
    })
  );

  await ctx.reply("✅ Вопрос создан и будет отправлен по расписанию.");
}