import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";

export async function nothingDoneReasonConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("Понял. Можешь коротко написать, почему сегодня не было активности? (или просто напиши \"-\", если без причины)\n(или напиши /menu, чтобы отменить)");

  const reasonCtx = await conversation.waitFor("message:text");

  if (reasonCtx.message?.text && MENU_TRIGGERS.includes(reasonCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  const reason = reasonCtx.message!.text.trim();

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "EVENING" } })
  );

  await conversation.external(() => 
    prisma.answer.create({ 
      data: { userId: user.id, checkInId: checkIn.id, value: reason } 
    })
  );

  await ctx.reply("✅ Записал, спасибо. Хорошего вечера.");
}