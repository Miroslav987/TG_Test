import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma } from "../index";
import { askQuestionHelper } from "../utils/questions";

export async function customQuestionConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
 
  const questionId = 
    ctx.match?.[1] || 
    ctx.callbackQuery?.data?.replace("ans_custom_", "") || 
    ctx.session?.customQuestionId;
    
  
  const promptMessageId = 
    ctx.callbackQuery?.message?.message_id || 
    ctx.session?.promptMessageId;

  if (!questionId) return;

  const q = await conversation.external(() => prisma.question.findUnique({ where: { id: questionId } }));
  const user = await conversation.external(() => prisma.user.findUnique({ where: { telegramId: ctx.from?.id } }));
  if (!q || !user) return;

  const answerVal = await askQuestionHelper(conversation, ctx, q);

  if (answerVal === "_CANCEL_") return;

  await conversation.external(() => 
    prisma.answer.create({ 
      data: { userId: user.id, questionId: q.id, value: answerVal } 
    })
  );

  await ctx.reply("✅ Ответ сохранен, спасибо!");

  // Удаляем исходное сообщение-приглашение после успешного ответа
  if (promptMessageId) {
    await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
  }
  
  // Очищаем сессию на всякий случай
  ctx.session.promptMessageId = undefined;
  ctx.session.customQuestionId = undefined;
}