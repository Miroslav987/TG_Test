import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";

export async function newTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ 
      where: { telegramId: ctx.from?.id }, 
      include: { projects: { where: { isActive: true } } } 
    })
  );
  
  if (!user) return;

  let projectId: string | null | undefined = undefined;
  let selectedProject: any = null;

  while (projectId === undefined) {
    const projectKb = new InlineKeyboard();
    user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
    
    // ДОБАВЛЕНО: Кнопка "Без проекта"
    projectKb.text("🙋 Без проекта (личная задача)", "task_no_project").row();
    
    await ctx.reply("Для какого проекта задача?", { reply_markup: projectKb });
    
    const projCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

    if (projCtx.message?.text && MENU_TRIGGERS.includes(projCtx.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      return;
    }

    if (projCtx.has("callback_query:data")) {
      const data = projCtx.callbackQuery.data;
      if (data === "task_no_project") {
        projectId = null;
        selectedProject = null;
        try { await projCtx.answerCallbackQuery(); } catch (e) {}
      } else if (data.startsWith("proj_")) {
        projectId = data.replace("proj_", "");
        selectedProject = user.projects.find(p => p.id === projectId);
        try { await projCtx.answerCallbackQuery(); } catch (e) {}
      }
    } else if (projCtx.has("message:text")) {
      const text = projCtx.message.text.toLowerCase().trim();
      const matches = user.projects.filter(p => p.name.toLowerCase().includes(text));
      
      if (matches.length === 1) {
        projectId = matches[0].id;
        selectedProject = matches[0];
      } else {
        await ctx.reply("Не нашёл проект с таким названием (или нашлось несколько). Пожалуйста, выбери кнопкой:");
      }
    }
  }

  await ctx.reply("Что нужно сделать?");
  let title = "";
  
  while (!title) {
    const taskCtx = await conversation.waitFor("message:text");
    
    if (taskCtx.message?.text && MENU_TRIGGERS.includes(taskCtx.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      return;
    }

    if (taskCtx.message?.text?.trim()) {
      title = taskCtx.message.text.trim();
    } else {
      await ctx.reply("Пожалуйста, напиши текст задачи.");
    }
  }

  await conversation.external(() => 
    prisma.task.create({
      data: { title, projectId, assigneeId: user.id, status: "TODO" } // projectId может быть null
    })
  );

  if (projectId) {
    await ctx.reply(`✅ Задача «${title}» добавлена в проект «${selectedProject?.name}»`);
  } else {
    await ctx.reply(`✅ Задача «${title}» добавлена (личная)`);
  }
}