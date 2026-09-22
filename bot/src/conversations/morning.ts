// import { Conversation } from "@grammyjs/conversations";
// import { InlineKeyboard } from "grammy";
// import { MyContext, prisma } from "../index";
// import { askQuestionHelper } from "../utils/questions";

// export async function morningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
//   // ДОБАВЛЕНО: include: { roles: true }
//   const user = await conversation.external(() => 
//     prisma.user.findUnique({ where: { telegramId: ctx.from?.id }, include: { projects: true, roles: true } })
//   );
//   if (!user) return;

//   await ctx.reply("Давай составим план на день! 📝");

//   const checkIn = await conversation.external(() => 
//     prisma.checkIn.create({ data: { userId: user.id, type: "MORNING" } })
//   );

//   // ИСПРАВЛЕНА ЛОГИКА ФИЛЬТРАЦИИ ВОПРОСОВ
//   const questions = await conversation.external(() => 
//     prisma.question.findMany({
//       where: {
//         checkInTime: { in: ["MORNING", "BOTH"] },
//         OR: [
//           { targetUserId: user.id }, // Персональные
//           { targetRoleId: { in: user.roles.map(r => r.id) } }, // По любой из ролей юзера
//           { targetUserId: null, targetRoleId: null } // Общие вопросы (для всех)
//         ]
//       }
//     })
//   );


//   // 1. Задаем кастомные вопросы
//  for (const q of questions) {
//     const answerVal = await askQuestionHelper(conversation, ctx, q);
//     await conversation.external(() => 
//       prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerVal } })
//     );
//   }

//   // 2. Выбор проекта
//   if (user.projects.length === 0) {
//     await ctx.reply("У тебя пока нет активных проектов. На этом всё, хорошего дня! ✨");
//     return;
//   }

//   const projectKb = new InlineKeyboard();
//   user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
  
//   await ctx.reply("Над каким проектом сегодня работаешь?", { reply_markup: projectKb });
//    const projCtx = await conversation.waitForCallbackQuery(/proj_.+/);
//   const projectId = projCtx.callbackQuery!.data.replace("proj_", "");
//   await projCtx.answerCallbackQuery();

//   // Подгружаем проект, чтобы узнать, нужны ли таски
//   const project = await conversation.external(() => 
//     prisma.project.findUnique({ where: { id: projectId } })
//   );
//   if (!project) return;

//   // 3. Выбор задач (или ввод текста)
//   if (project.tasksRequired) {
//     const tasks = await conversation.external(() => 
//       prisma.task.findMany({ where: { projectId, assigneeId: user.id, status: { not: "DONE" } } })
//     );

//     if (tasks.length > 0) {
//       const taskKb = new InlineKeyboard();
//       tasks.forEach(t => taskKb.text(t.title, `task_${t.id}`).row());
//       taskKb.text("👉 Напишу текстом", "task_custom");

//       await ctx.reply("Выбери главную задачу на сегодня (или введи новую):", { reply_markup: taskKb });
//       const taskCtx = await conversation.waitForCallbackQuery(/task_.+/);
//       await taskCtx.answerCallbackQuery();

//       // Проверяем data вместо match
//       if (taskCtx.callbackQuery!.data === "task_custom") {
//         await ctx.reply("Кратко опиши свою задачу на сегодня:");
//         const customCtx = await conversation.waitFor("message:text");
//         // СОЗДАЁМ НАСТОЯЩУЮ ЗАДАЧУ
//         await conversation.external(() => 
//           prisma.task.create({
//             data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" }
//           })
//         );
//       }
//     } else {
//       await ctx.reply("Открытых задач по проекту в базе нет. Опиши кратко, что планируешь делать:");
//       const customCtx = await conversation.waitFor("message:text");
//       // СОЗДАЁМ НАСТОЯЩУЮ ЗАДАЧУ
//       await conversation.external(() => 
//         prisma.task.create({
//           data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" }
//         })
//       );
//     }
//   } else {
//     // Неформальный проект (без задач)
//     await ctx.reply("Что планируешь делать сегодня?");
//     const answerCtx = await conversation.waitFor("message:text");
//     await conversation.external(() => 
//       prisma.answer.create({
//         data: { checkInId: checkIn.id, value: answerCtx.message!.text } // без questionId
//       })
//     );
//   }

//   await ctx.reply("✅ Отлично! Утренний план сохранен. Продуктивного дня!");
// }

import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";

export async function morningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ 
      where: { telegramId: ctx.from?.id }, 
      include: { projects: { where: { isActive: true } } } 
    })
  );
  if (!user) return;

  await ctx.reply("Давай составим план на день! 📝");

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "MORNING" } })
  );

  let projectId: string | null | undefined = undefined;
  
  if (user.projects.length > 0) {
    while (projectId === undefined) {
      const projectKb = new InlineKeyboard();
      user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
      projectKb.text("🙋 Без проекта (личная задача)", "task_no_project").row();
      
      const msg = await ctx.reply("Над каким проектом сегодня работаешь?", { reply_markup: projectKb });
      const projCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

      if (projCtx.message?.text && MENU_TRIGGERS.includes(projCtx.message.text)) {
        await ctx.reply("Отменил планирование.");
        return;
      }

      if (projCtx.has("callback_query:data")) {
        const data = projCtx.callbackQuery.data;
        await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
        
        if (data === "task_no_project") {
          projectId = null;
        } else if (data.startsWith("proj_")) {
          projectId = data.replace("proj_", "");
        }
        try { await projCtx.answerCallbackQuery(); } catch (e) {}
      } else if (projCtx.has("message:text")) {
        const text = projCtx.message.text.toLowerCase().trim();
        const matches = user.projects.filter(p => p.name.toLowerCase().includes(text));
        
        if (matches.length === 1) {
          projectId = matches[0].id;
        } else {
          await ctx.reply("Не нашёл проект. Выбери кнопкой:");
        }
      }
    }
  } else {
    projectId = null;
  }

  let tasksRequired = true;
  if (projectId) {
    const project = await conversation.external(() => prisma.project.findUnique({ where: { id: projectId } }));
    if (project) tasksRequired = project.tasksRequired;
  }

  if (tasksRequired) {
    let tasks: any[] = [];
    if (projectId) {
      tasks = await conversation.external(() => 
        prisma.task.findMany({ where: { projectId: projectId, assigneeId: user.id, status: { not: "DONE" } } })
      );
    }

    if (tasks.length > 0) {
      const taskKb = new InlineKeyboard();
      tasks.forEach(t => taskKb.text(t.title, `task_${t.id}`).row());
      taskKb.text("👉 Напишу текстом", "task_custom");

      const msg = await ctx.reply("Выбери задачу на сегодня (или введи новую):", { reply_markup: taskKb });
      const taskCtx = await conversation.waitForCallbackQuery(/task_.+/);
      const action = taskCtx.callbackQuery.data;
      
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      try { await taskCtx.answerCallbackQuery(); } catch (e) {}

      if (action === "task_custom") {
        await ctx.reply("Кратко опиши задачу:");
        const customCtx = await conversation.waitFor("message:text");
        if (customCtx.message?.text && MENU_TRIGGERS.includes(customCtx.message.text)) return;
        await conversation.external(() => 
          prisma.task.create({ data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" } })
        );
      } else {
        const selectedTaskId = action.replace("task_", "");
        await conversation.external(() => 
          prisma.task.update({ where: { id: selectedTaskId }, data: { status: "IN_PROGRESS" } })
        );
      }
    } else {
      await ctx.reply("Открытых задач нет. Опиши кратко, что планируешь делать:");
      const customCtx = await conversation.waitFor("message:text");
      if (customCtx.message?.text && MENU_TRIGGERS.includes(customCtx.message.text)) return;
      await conversation.external(() => 
        prisma.task.create({ data: { title: customCtx.message!.text, projectId, assigneeId: user.id, status: "IN_PROGRESS" } })
      );
    }
  } else {
    await ctx.reply("Что планируешь делать сегодня?");
    const answerCtx = await conversation.waitFor("message:text");
    if (answerCtx.message?.text && MENU_TRIGGERS.includes(answerCtx.message.text)) return;
    await conversation.external(() => 
      prisma.answer.create({ data: { userId: user.id, checkInId: checkIn.id, value: answerCtx.message!.text } })
    );
  }

  await ctx.reply("✅ Утренний план сохранен. Продуктивного дня!");
}