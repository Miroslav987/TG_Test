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

  // Сохраняем ответ напрямую
  await conversation.external(() => 
    prisma.answer.create({ 
      data: { 
        userId: user.id,
        questionId: q.id, 
        value: answerVal 
      } 
    })
  );

  await ctx.reply("✅ Ответ сохранен, спасибо!");
}


// import { Conversation } from "@grammyjs/conversations";
// import { MyContext, prisma } from "../index";
// import { askQuestionHelper } from "../utils/questions";

// export async function customQuestionConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
//   // Забираем ID напрямую из нажатой кнопки (ctx.match) или из сессии
//  const questionId = 
//   ctx.match?.[1] || 
//   ctx.callbackQuery?.data?.replace("ans_custom_", "") || 
//   ctx.session?.customQuestionId;

//   if (!questionId) {
//     await ctx.reply("❌ Не удалось определить ID вопроса.");
//     return;
//   }

//   const q = await conversation.external(() => prisma.question.findUnique({ where: { id: questionId } }));
//   const user = await conversation.external(() => prisma.user.findUnique({ where: { telegramId: ctx.from?.id } }));
//   if (!q || !user) return;

//   const answerVal = await askQuestionHelper(conversation, ctx, q);

//   // Создаем "пустой" чек-ин с типом CUSTOM, чтобы привязать к нему ответ
//   const checkIn = await conversation.external(() => 
//     prisma.checkIn.create({ data: { userId: user.id, type: "CUSTOM" } })
//   );

//   await conversation.external(() => 
//     prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerVal } })
//   );

//   await ctx.reply("✅ Ответ сохранен, спасибо!");
// }