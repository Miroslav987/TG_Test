import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";

export async function eveningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "EVENING" } })
  );

  // 1. Апдейт статусов открытых тасок юзера
  const openTasks = await conversation.external(() => 
    prisma.task.findMany({ where: { assigneeId: user.id, status: { not: "DONE" } } })
  );

  if (openTasks.length > 0) {
    await ctx.reply("Давай актуализируем статусы твоих задач:");
    
    for (const task of openTasks) {
      const kb = new InlineKeyboard()
        .text("✅ Сделано", "DONE").row()
        .text("🔄 В процессе", "IN_PROGRESS").row()
        .text("⛔ Блокер", "BLOCKED");

      await ctx.reply(`Задача: ${task.title}\nКакой статус?`, { reply_markup: kb });
      
      const statusCtx = await conversation.waitForCallbackQuery(["DONE", "IN_PROGRESS", "BLOCKED"]);
      const newStatus = statusCtx.match as "DONE" | "IN_PROGRESS" | "BLOCKED";
      await statusCtx.answerCallbackQuery();

      await conversation.external(() => 
        prisma.task.update({ where: { id: task.id }, data: { status: newStatus } })
      );

      // Если блокер — спрашиваем почему
      if (newStatus === "BLOCKED") {
        await ctx.reply("Что мешает выполнению? (опиши причину)");
        const blockerCtx = await conversation.waitFor("message:text");
        await conversation.external(() => 
          prisma.answer.create({ 
            data: { checkInId: checkIn.id, value: `Блокер по задаче '${task.title}': ${blockerCtx.message!.text}` } 
          })
        );
      }
    }
  }

  // 2. Вечерние вопросы (ролевые и кастомные)
  const questions = await conversation.external(() => 
    prisma.question.findMany({
      where: {
        checkInTime: { in: ["EVENING", "BOTH"] },
        OR: [{ targetUserId: user.id }, { targetRoleId: user.roleId }]
      }
    })
  );

  for (const q of questions) {
    await ctx.reply(q.text); // Упрощенно ждем текст, для масштабируемости можно добавить кнопки как утром
    const answerCtx = await conversation.waitFor("message:text");
    await conversation.external(() => 
      prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerCtx.message!.text } })
    );
  }

  await ctx.reply("Как в целом прошел день? (свободный итог)");
  const summaryCtx = await conversation.waitFor("message:text");
  await conversation.external(() => 
    prisma.answer.create({ data: { checkInId: checkIn.id, value: summaryCtx.message!.text } })
  );

  await ctx.reply("✨ Итоги дня записаны. Отдыхай!");
}