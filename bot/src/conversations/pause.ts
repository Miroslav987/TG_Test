import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";
import { addDays } from "date-fns";

export async function pauseConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("На сколько дней поставить паузу? (просто число)");
  
  const daysCtx = await conversation.waitFor("message:text");

  // ПРОВЕРКА НА ТРИГГЕРЫ МЕНЮ
  if (daysCtx.message?.text && MENU_TRIGGERS.includes(daysCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

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