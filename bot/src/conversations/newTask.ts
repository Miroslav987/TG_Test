import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";

// ДОБАВЛЕН ТРЕТИЙ АРГУМЕНТ PREFILL
export async function newTaskConversation(
  conversation: Conversation<MyContext>, 
  ctx: MyContext,
  prefill?: { title?: string; projectId?: string | null }
) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ 
      where: { telegramId: ctx.from?.id }, 
      include: { projects: { where: { isActive: true } } } 
    })
  );
  
  if (!user) return;

  let projectId: string | null | undefined = prefill?.projectId;
  let selectedProject: any = null;

  // Если проект пришел из prefill (даже если он null для личной задачи)
  if (projectId !== undefined && projectId !== null) {
    selectedProject = user.projects.find(p => p.id === projectId);
  }

  // 1. ВЫБОР ПРОЕКТА (ПРОПУСКАЕТСЯ, ЕСЛИ ЕСТЬ PREFILL)
  while (projectId === undefined) {
    if (user.projects.length === 0) {
      await ctx.reply("У тебя пока нет активных проектов. Создаю личную задачу.");
      projectId = null;
      break;
    }

    const projectKb = new InlineKeyboard();
    user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
    projectKb.text("🙋 Без проекта (личная задача)", "task_no_project").row();
    projectKb.text("❌ Отмена", "cancel_flow");
    
    const msg = await ctx.reply("Для какого проекта задача?", { reply_markup: projectKb });
    const projCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

    if (projCtx.message?.text && MENU_TRIGGERS.includes(projCtx.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      return;
    }

    if (projCtx.callbackQuery?.data === "cancel_flow") {
      try { await projCtx.answerCallbackQuery(); } catch (e) {}
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      await ctx.reply("❌ Отменено.");
      return;
    }

    if (projCtx.has("callback_query:data")) {
      const data = projCtx.callbackQuery.data;
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      
      if (data === "task_no_project") {
        projectId = null;
        selectedProject = null;
      } else if (data.startsWith("proj_")) {
        projectId = data.replace("proj_", "");
        selectedProject = user.projects.find(p => p.id === projectId);
      }
      try { await projCtx.answerCallbackQuery(); } catch (e) {}
    } else if (projCtx.has("message:text")) {
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      const text = projCtx.message.text.toLowerCase().trim();
      const matches = user.projects.filter(p => p.name.toLowerCase().includes(text));
      
      if (matches.length === 1) {
        projectId = matches[0].id;
        selectedProject = matches[0];
      } else {
        await ctx.reply("Не нашёл проект. Выбери кнопкой или нажми ❌ Отмена:");
      }
    }
  }

  // 2. ВВОД ТЕКСТА ЗАДАЧИ (ПРОПУСКАЕТСЯ, ЕСЛИ ЕСТЬ PREFILL)
  let title = prefill?.title || "";
  
  if (!title) {
    await ctx.reply("Что нужно сделать?\n(или напиши /menu, чтобы отменить)");
    
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
  }

  // 3. ФИНАЛЬНОЕ ПОДТВЕРЖДЕНИЕ (ТОЛЬКО ДЛЯ PREFILL)
  const usedPrefill = prefill && (prefill.title !== undefined || prefill.projectId !== undefined);
  
  if (usedPrefill) {
    const projDesc = projectId ? `в проекте «${selectedProject?.name}»` : "без проекта (личная)";
    const confKb = new InlineKeyboard().text("✅ Создать", "yes").text("❌ Отмена", "cancel_flow");
    
    const confMsg = await ctx.reply(`Создаю задачу «${title}» ${projDesc}. Всё верно?`, { reply_markup: confKb });
    
    const confCtx = await conversation.waitForCallbackQuery(["yes", "cancel_flow"]);
    await ctx.api.deleteMessage(ctx.chat!.id, confMsg.message_id).catch(() => {});
    try { await confCtx.answerCallbackQuery(); } catch (e) {}
    
    if (confCtx.match === "cancel_flow") {
      await ctx.reply("❌ Отменено.");
      return;
    }
  }

  // 4. СОХРАНЕНИЕ В БАЗУ
  await conversation.external(() => 
    prisma.task.create({
      data: { title, projectId, assigneeId: user.id, status: "TODO", createdById: user.id }
    })
  );

  if (projectId) {
    await ctx.reply(`✅ Задача «${title}» добавлена в проект «${selectedProject?.name}»`);
  } else {
    await ctx.reply(`✅ Задача «${title}» добавлена (личная)`);
  }
}