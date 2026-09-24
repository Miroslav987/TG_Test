import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { sendTelegramMessage } from "@standup/shared";

export async function assignTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const admin = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  
  if (!admin?.isAdmin) {
    await ctx.reply("⛔ Эта команда доступна только администраторам.");
    return;
  }

  // 1. ВЫБОР СОТРУДНИКА (С ПОСТРАНИЧНОСТЬЮ)
  let assigneeId: string | undefined = undefined;
  let assigneeName = "";
  let page = 0;
  const pageSize = 5;

  while (!assigneeId) {
    const activeUsers = await conversation.external(() => 
      prisma.user.findMany({ where: { isActive: true, id: { not: admin.id } }, orderBy: { name: 'asc' } })
    );

    if (activeUsers.length === 0) {
      await ctx.reply("В системе нет активных сотрудников для назначения задачи.");
      return;
    }

    const totalPages = Math.ceil(activeUsers.length / pageSize);
    const currentUsers = activeUsers.slice(page * pageSize, (page + 1) * pageSize);

    const kb = new InlineKeyboard();
    currentUsers.forEach(u => kb.text(u.name, `assign_${u.id}`).row());

    const navRow = [];
    if (page > 0) navRow.push(InlineKeyboard.text("⬅️ Назад", `page_${page - 1}`));
    if (page < totalPages - 1) navRow.push(InlineKeyboard.text("Вперёд ➡️", `page_${page + 1}`));
    if (navRow.length > 0) kb.row(...navRow);

    const msg = await ctx.reply("Кому назначить задачу?", { reply_markup: kb });
    const resp = await conversation.waitFor(["callback_query:data", "message:text"]);

    if (resp.message?.text && MENU_TRIGGERS.includes(resp.message.text)) {
      await ctx.reply("Отменил текущее действие.");
      return;
    }

    if (resp.has("callback_query:data")) {
      const data = resp.callbackQuery.data;
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      
      if (data.startsWith("page_")) {
        page = parseInt(data.replace("page_", ""));
        try { await resp.answerCallbackQuery(); } catch (e) {}
      } else if (data.startsWith("assign_")) {
        assigneeId = data.replace("assign_", "");
        assigneeName = activeUsers.find(u => u.id === assigneeId)?.name || "Сотруднику";
        try { await resp.answerCallbackQuery(); } catch (e) {}
      }
    }
  }

  // 2. ВЫБОР ПРОЕКТА (Одинаково для всех задач)
  let projectId: string | null | undefined = undefined;
  let selectedProjectName = "личная";

  while (projectId === undefined) {
    const projects = await conversation.external(() => prisma.project.findMany({ where: { isActive: true } }));
    const projectKb = new InlineKeyboard();
    projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
    projectKb.text("🙋 Без проекта (личная задача)", "task_no_project").row();
    
    const pMsg = await ctx.reply("Для какого проекта задача?", { reply_markup: projectKb });
    const projCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

    if (projCtx.message?.text && MENU_TRIGGERS.includes(projCtx.message.text)) return;

    if (projCtx.has("callback_query:data")) {
      const data = projCtx.callbackQuery.data;
      await ctx.api.deleteMessage(ctx.chat!.id, pMsg.message_id).catch(() => {});
      
      if (data === "task_no_project") {
        projectId = null;
      } else if (data.startsWith("proj_")) {
        projectId = data.replace("proj_", "");
        selectedProjectName = projects.find(p => p.id === projectId)?.name || "личная";
      }
      try { await projCtx.answerCallbackQuery(); } catch (e) {}
    } else if (projCtx.has("message:text")) {
      await ctx.api.deleteMessage(ctx.chat!.id, pMsg.message_id).catch(() => {});
      const text = projCtx.message.text.toLowerCase().trim();
      const matches = projects.filter(p => p.name.toLowerCase().includes(text));
      
      if (matches.length === 1) {
        projectId = matches[0].id;
        selectedProjectName = matches[0].name;
      } else {
        await ctx.reply("Не нашёл проект. Пожалуйста, выбери кнопкой:");
      }
    }
  }

  // 3. ТЕКСТ ЗАДАЧИ
  await ctx.reply("Напиши текст задачи:");
  const taskCtx = await conversation.waitFor("message:text");
  
  if (taskCtx.message?.text && MENU_TRIGGERS.includes(taskCtx.message.text)) return;
  const title = taskCtx.message!.text.trim();

  // 4. СОЗДАНИЕ В БД
  const newTask = await conversation.external(() => 
    prisma.task.create({
      data: { 
        title, 
        projectId, 
        assigneeId, 
        createdById: admin.id, // <-- Связь с админом
        status: "TODO" 
      },
      include: { assignee: true }
    })
  );

  let notifyError = false;

  // 5. ОТПРАВКА УВЕДОМЛЕНИЯ ИСПОЛНИТЕЛЮ
  if (newTask.assignee?.telegramId) {
    const notifyText = `📌 *Вам назначена новая задача*\n${title}\n\nОт: ${admin.name}\nПроект: ${selectedProjectName}`;
    const kb = [[{ text: "✅ Принял", callback_data: `ack_task_${newTask.id}` }]];
    
    try {
      await conversation.external(() => sendTelegramMessage(newTask.assignee!.telegramId!, notifyText, kb));
    } catch (e) {
      console.warn("Не удалось отправить уведомление исполнителю:", e);
      notifyError = true;
    }
  }

  await ctx.reply(`✅ Задача успешно назначена на ${assigneeName}.${notifyError ? "\n⚠️ *Внимание:* Задача создана, но уведомление не доставлено (возможно, бот заблокирован сотрудником)." : ""}`, { parse_mode: "Markdown" });
}