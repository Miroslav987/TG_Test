import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";
import { addDays } from "date-fns";

export async function pauseConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  const kb = new InlineKeyboard().text("❌ Отмена", "cancel_flow");
  const msg = await ctx.reply("На сколько дней поставить паузу? (просто число)\n(или напиши /menu, чтобы отменить)", { reply_markup: kb });
  
  const daysCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

  if (daysCtx.message?.text && MENU_TRIGGERS.includes(daysCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  if (daysCtx.callbackQuery?.data === "cancel_flow") {
    try { await daysCtx.answerCallbackQuery(); } catch (e) {}
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    await ctx.reply("❌ Отменено.");
    return;
  }

  if (!daysCtx.has("message:text")) {
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    await ctx.reply("Не понял. Введи число дней или нажми ❌ Отмена.");
    return;
  }

  await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});

  const daysText = daysCtx.message!.text.trim();
  const days = parseInt(daysText, 10);

  if (isNaN(days) || days < 1) {
    await ctx.reply("Введи число дней, например 3. Действие отменено.");
    return;
  }

  const pausedUntil = addDays(new Date(), days);

  await conversation.external(() => 
    prisma.user.update({
      where: { id: user.id },
      data: { pausedUntil }
    })
  );

  await ctx.reply(`🏖 Ок, до ${pausedUntil.toLocaleDateString('ru-RU')} не буду тебя беспокоить. Вернёшься раньше — напиши /unpause.`);
}