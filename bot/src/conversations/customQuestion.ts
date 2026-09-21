import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma } from "../index";
import { askQuestionHelper } from "../utils/questions";

export async function customQuestionConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
   const questionId = 
  ctx.match?.[1] || 
  ctx.callbackQuery?.data?.replace("ans_custom_", "") || 
  ctx.session?.customQuestionId;
  if (!questionId) return;

  const q = await conversation.external(() => prisma.question.findUnique({ where: { id: questionId } }));
  const user = await conversation.external(() => prisma.user.findUnique({ where: { telegramId: ctx.from?.id } }));
  if (!q || !user) return;

  const answerVal = await askQuestionHelper(conversation, ctx, q);

  // ЕСЛИ ПОЛЬЗОВАТЕЛЬ НАЖАЛ НА МЕНЮ - ВЫХОДИМ, НЕ СОХРАНЯЯ ПУСТОЙ ОТВЕТ
  if (answerVal === "_CANCEL_") return;

  await conversation.external(() => 
    prisma.answer.create({ 
      data: { userId: user.id, questionId: q.id, value: answerVal } 
    })
  );

  await ctx.reply("✅ Ответ сохранен, спасибо!");
}