import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";

export async function morningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  // ДОБАВЛЕНО: include: { roles: true }
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id }, include: { projects: true, roles: true } })
  );
  if (!user) return;

  await ctx.reply("Давай составим план на день! 📝");

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "MORNING" } })
  );

  // ИСПРАВЛЕНА ЛОГИКА ФИЛЬТРАЦИИ ВОПРОСОВ
  const questions = await conversation.external(() => 
    prisma.question.findMany({
      where: {
        checkInTime: { in: ["MORNING", "BOTH"] },
        OR: [
          { targetUserId: user.id }, // Персональные
          { targetRoleId: { in: user.roles.map(r => r.id) } }, // По любой из ролей юзера
          { targetUserId: null, targetRoleId: null } // Общие вопросы (для всех)
        ]
      }
    })
  );


  // 1. Задаем кастомные вопросы
  for (const q of questions) {
    if (q.type === "YES_NO") {
      const kb = new InlineKeyboard().text("✅ Да", "yes").text("❌ Нет", "no");
      await ctx.reply(q.text, { reply_markup: kb });
      const answerCtx = await conversation.waitForCallbackQuery(["yes", "no"]);
      await answerCtx.answerCallbackQuery();
      
      await conversation.external(() => 
        prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerCtx.match } })
      );
    } else {
      // Для текста, чисел и т.д.
      await ctx.reply(q.text);
      const answerCtx = await conversation.waitFor("message:text");
      await conversation.external(() => 
        prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerCtx.message!.text } })
      );
    }
  }

  // 2. Выбор проекта
  if (user.projects.length === 0) {
    await ctx.reply("У тебя пока нет активных проектов. На этом всё, хорошего дня! ✨");
    return;
  }

  const projectKb = new InlineKeyboard();
  user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
  
  await ctx.reply("Над каким проектом сегодня работаешь?", { reply_markup: projectKb });
   const projCtx = await conversation.waitForCallbackQuery(/proj_.+/);
  const projectId = projCtx.match.split("_")[1];
  await projCtx.answerCallbackQuery();

  // Подгружаем проект, чтобы узнать, нужны ли таски
  const project = await conversation.external(() => 
    prisma.project.findUnique({ where: { id: projectId } })
  );
  if (!project) return;

  // 3. Выбор задач (или ввод текста)
  if (project.tasksRequired) {
    const tasks = await conversation.external(() => 
      prisma.task.findMany({ where: { projectId, assigneeId: user.id, status: { not: "DONE" } } })
    );

    if (tasks.length > 0) {
      const taskKb = new InlineKeyboard();
      tasks.forEach(t => taskKb.text(t.title, `task_${t.id}`).row());
      taskKb.text("👉 Напишу текстом", "task_custom");

      await ctx.reply("Выбери главную задачу на сегодня (или введи новую):", { reply_markup: taskKb });
      const taskCtx = await conversation.waitForCallbackQuery(/task_.+/);
      await taskCtx.answerCallbackQuery();

      if (taskCtx.match === "task_custom") {
        await ctx.reply("Кратко опиши свою задачу на сегодня:");
        const customCtx = await conversation.waitFor("message:text");
        // СОЗДАЁМ НАСТОЯЩУЮ ЗАДАЧУ
        await conversation.external(() => 
          prisma.task.create({
            data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" }
          })
        );
      }
    } else {
      await ctx.reply("Открытых задач по проекту в базе нет. Опиши кратко, что планируешь делать:");
      const customCtx = await conversation.waitFor("message:text");
      // СОЗДАЁМ НАСТОЯЩУЮ ЗАДАЧУ
      await conversation.external(() => 
        prisma.task.create({
          data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" }
        })
      );
    }
  } else {
    // Неформальный проект (без задач)
    await ctx.reply("Что планируешь делать сегодня?");
    const answerCtx = await conversation.waitFor("message:text");
    await conversation.external(() => 
      prisma.answer.create({
        data: { checkInId: checkIn.id, value: answerCtx.message!.text } // без questionId
      })
    );
  }

  await ctx.reply("✅ Отлично! Утренний план сохранен. Продуктивного дня!");
}