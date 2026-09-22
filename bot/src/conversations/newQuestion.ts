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
  await ctx.reply("Текст вопроса?");
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
    .text("Несколько вариантов", "MULTI_SELECT");
    
  await ctx.reply("Тип ответа?", { reply_markup: typeKb });
  const typeCtx = await conversation.waitForCallbackQuery(["TEXT", "NUMBER", "YES_NO", "SELECT", "MULTI_SELECT"]);
  const type = typeCtx.match;
  try { await typeCtx.answerCallbackQuery(); } catch (e) {}

  let options: string[] = [];
  if (type === "SELECT" || type === "MULTI_SELECT") {
    await ctx.reply("Введите варианты ответа через запятую:");
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
    .text("Каждую неделю в этот день и время", "WEEKLY");
    
  await ctx.reply("Когда отправлять?", { reply_markup: schedKb });
  const schedCtx = await conversation.waitForCallbackQuery(["EXACT_TIME", "DAILY", "WEEKLY"]);
  const scheduleChoice = schedCtx.match;
  try { await schedCtx.answerCallbackQuery(); } catch (e) {}

  let scheduleType: "EXACT_TIME" | "RECURRING" = "RECURRING";
  let exactTime: Date | null = null;
  let recurrenceInterval: "DAILY" | "WEEKLY" | null = null;
  let recurrenceTime: string | null = null;
  let recurrenceDay: number | null = null;

  if (scheduleChoice === "EXACT_TIME") {
    scheduleType = "EXACT_TIME";
    exactTime = new Date(); // Уйдет прямо сейчас (или в течение 1 минуты через тикер)
  } else {
    scheduleType = "RECURRING";
    recurrenceInterval = scheduleChoice as "DAILY" | "WEEKLY";
    
    await ctx.reply("Во сколько? (например 09:00)");
    const timeCtx = await conversation.waitFor("message:text");
    if (MENU_TRIGGERS.includes(timeCtx.message.text)) {
      await ctx.reply("Отменил текущее действие.");
      return;
    }
    recurrenceTime = timeCtx.message.text.trim();
    
    if (recurrenceInterval === "WEEKLY") {
      // День недели в локальной таймзоне на момент создания
      recurrenceDay = parseInt(formatInTimeZone(new Date(), "Asia/Bishkek", "i"));
    }
  }

  // 4. Аудитория
  const targetKb = new InlineKeyboard()
    .text("Всем", "GENERAL").text("По роли", "ROLE").text("Одному человеку", "USER");
    
  await ctx.reply("Кому адресовать?", { reply_markup: targetKb });
  const targetCtx = await conversation.waitForCallbackQuery(["GENERAL", "ROLE", "USER"]);
  const targetTypeStr = targetCtx.match;
  try { await targetCtx.answerCallbackQuery(); } catch (e) {}

  let targetRoleId: string | null = null;
  let targetUserId: string | null = null;

  if (targetTypeStr === "ROLE") {
    const roles = await conversation.external(() => prisma.role.findMany());
    const rKb = new InlineKeyboard();
    roles.forEach((r: any) => rKb.text(r.name, `role_${r.id}`).row());
    
    await ctx.reply("Выберите роль:", { reply_markup: rKb });
    const rCtx = await conversation.waitForCallbackQuery(/role_.+/);
    targetRoleId = rCtx.match.replace("role_", "");
    try { await rCtx.answerCallbackQuery(); } catch (e) {}
  } 
  else if (targetTypeStr === "USER") {
    const users = await conversation.external(() => prisma.user.findMany({ where: { isActive: true } }));
    const uKb = new InlineKeyboard();
    users.forEach((u: any) => uKb.text(u.name, `user_${u.id}`).row());
    
    await ctx.reply("Выберите сотрудника:", { reply_markup: uKb });
    const uCtx = await conversation.waitForCallbackQuery(/user_.+/);
    targetUserId = uCtx.match.replace("user_", "");
    try { await uCtx.answerCallbackQuery(); } catch (e) {}
  }

  // 5. Флаги и параметры
  const askYesNo = async (question: string) => {
    const kb = new InlineKeyboard().text("Да", "yes").text("Нет", "no");
    await ctx.reply(question, { reply_markup: kb });
    const r = await conversation.waitForCallbackQuery(["yes", "no"]);
    try { await r.answerCallbackQuery(); } catch (e) {}
    return r.match === "yes";
  };

  const isRequired = await askYesNo("Обязательный вопрос?");
  const remindUntilAnswered = await askYesNo("Напоминать, пока не ответит?");
  const includeInReport = await askYesNo("Включать в сводные отчёты?");

  // 6. Сохранение
  await conversation.external(() => 
    prisma.question.create({
      data: {
        text, 
        type: type as any, 
        options,
        scheduleType, 
        exactTime, 
        recurrenceInterval, 
        recurrenceTime, 
        recurrenceDay,
        targetRoleId, 
        targetUserId,
        isRequired, 
        remindUntilAnswered, 
        includeInReport
      }
    })
  );

  await ctx.reply("✅ Вопрос создан и будет отправлен по расписанию.");
}