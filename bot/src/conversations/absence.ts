import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sendTelegramMessage } from "@standup/shared";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { endOfDay } from "date-fns";

export async function absenceConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("Напиши, когда и на сколько тебя не будет — например «меня не будет с 25 по 27 сентября», «завтра выходной», или «сегодня отойду с 14 до 16, потом на связи».");
  
  const textCtx = await conversation.waitFor("message:text");
  if (textCtx.message?.text && MENU_TRIGGERS.includes(textCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }
  
  const userInput = textCtx.message!.text.trim();
  const todayDate = formatInTimeZone(new Date(), "Asia/Bishkek", "yyyy-MM-dd");

  const msg = await ctx.reply("⏳ Анализирую...");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

  const prompt = `
    Сегодняшняя дата (в часовом поясе Asia/Bishkek): ${todayDate}.
    Сотрудник написал: "${userInput}"
    
    Разбери это сообщение и верни СТРОГО валидный JSON без markdown-обёртки:
    {
      "type": "FULL_DAY" | "RANGE" | "PARTIAL_HOURS",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "startTime": "HH:mm" | null,
      "endTime": "HH:mm" | null,
      "reason": "краткая причина" | null
    }
    
    Правила:
    - Если указан один день без конкретных часов, type = FULL_DAY, startDate и endDate равны этому дню.
    - Если указано несколько дней, type = RANGE.
    - Если указан день и конкретные часы (с... до...), type = PARTIAL_HOURS, startDate и endDate равны этому дню.
    - Если сообщение вообще не похоже на указание отсутствия, верни { "error": true }.
  `;

  let parsedData: any = null;
  try {
    const rawText = await conversation.external(async () => {
      const result = await model.generateContent(prompt);
      return result.response.text();
    });
    // Очищаем от возможных Markdown-кавычек ```json ... ```
    const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsedData = JSON.parse(cleanedText);
  } catch (e) {
    console.error("Ошибка в absence.ts при обращении к Gemini:", e);
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    await ctx.reply("Не разобрал даты, попробуй написать конкретнее, например «с 25 по 27 сентября».");
    return;
  }

  if (!parsedData || parsedData.error) {
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    await ctx.reply("Не разобрал даты, попробуй написать конкретнее, например «с 25 по 27 сентября».");
    return;
  }

  let humanDesc = "";
  if (parsedData.type === "FULL_DAY") {
    humanDesc = `не будешь работать ${parsedData.startDate}`;
  } else if (parsedData.type === "RANGE") {
    humanDesc = `не будешь работать с ${parsedData.startDate} по ${parsedData.endDate}`;
  } else if (parsedData.type === "PARTIAL_HOURS") {
    humanDesc = `${parsedData.startDate} отойдешь с ${parsedData.startTime} до ${parsedData.endTime}, дальше на связи`;
  }

  const kb = new InlineKeyboard().text("✅ Да", "yes").text("❌ Нет", "no");
  await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `Правильно понял: ${humanDesc}?`, { reply_markup: kb });
  
  const confirmCtx = await conversation.waitForCallbackQuery(["yes", "no"]);
  const choice = confirmCtx.match;
  try { await confirmCtx.answerCallbackQuery(); } catch (e) {}
  await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});

  if (choice === "no") {
    await ctx.reply("Ок, отменил. Попробуй написать ещё раз.");
    return;
  }

  const sDate = fromZonedTime(`${parsedData.startDate} 00:00:00`, "Asia/Bishkek");
  const eDate = fromZonedTime(`${parsedData.endDate} 00:00:00`, "Asia/Bishkek");

  await conversation.external(async () => {
    await prisma.absence.create({
      data: {
        userId: user.id,
        type: parsedData.type,
        startDate: sDate,
        endDate: eDate,
        startTime: parsedData.startTime,
        endTime: parsedData.endTime,
        reason: parsedData.reason
      }
    });

    if (parsedData.type === "FULL_DAY" || parsedData.type === "RANGE") {
      const newPausedUntil = endOfDay(eDate);
      // Увеличиваем паузу только если новая дата дальше текущей (или паузы не было)
      if (!user.pausedUntil || newPausedUntil > user.pausedUntil) {
        await prisma.user.update({
          where: { id: user.id },
          data: { pausedUntil: newPausedUntil }
        });
      }
    }
  });

  await ctx.reply("✅ Записал, коллеги в курсе.");

  let adminDesc = "";
  if (parsedData.type === "FULL_DAY") adminDesc = `на весь день ${parsedData.startDate}`;
  else if (parsedData.type === "RANGE") adminDesc = `с ${parsedData.startDate} по ${parsedData.endDate}`;
  else if (parsedData.type === "PARTIAL_HOURS") adminDesc = `${parsedData.startDate} с ${parsedData.startTime} до ${parsedData.endTime}`;

  const admins = await conversation.external(() => 
    prisma.user.findMany({ where: { isAdmin: true, isActive: true, telegramId: { not: null } } })
  );

  for (const admin of admins) {
    await conversation.external(() => 
      sendTelegramMessage(
        admin.telegramId!,
        `🏖 *${user.name}* указал(а) отсутствие:\n${adminDesc}.\nПричина: ${parsedData.reason ?? 'не указана'}.`
      )
    );
  }
}