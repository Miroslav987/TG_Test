import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";

export async function editTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  // Получаем ID задачи из сессии
  // const taskId = ctx.session.editTaskId;

const taskId = ctx.match?.[1] || ctx.callbackQuery?.data?.replace("edit_task_", "");
  
  if (!taskId) return;

  const task = await conversation.external(() => 
    prisma.task.findUnique({ where: { id: taskId } })
  );

  if (!task) {
    await ctx.reply("Задача не найдена или уже удалена.");
    return;
  }

  const kb = new InlineKeyboard()
    .text("📝 Изменить текст", "edit_text").row()
    .text("🔄 Изменить статус", "edit_status").row()
    .text("❌ Отмена", "cancel");

  await ctx.reply(`Что изменить в задаче «${task.title}»?`, { reply_markup: kb });

  const actionCtx = await conversation.waitForCallbackQuery(["edit_text", "edit_status", "cancel"]);
  const action = actionCtx.callbackQuery.data;
  await actionCtx.answerCallbackQuery();

  if (action === "cancel") {
    await ctx.reply("Отменено.");
    return;
  }

  if (action === "edit_text") {
    await ctx.reply("Введи новый текст задачи:");
    const textCtx = await conversation.waitFor("message:text");
    const newText = textCtx.message!.text.trim();

    await conversation.external(() => 
      prisma.task.update({ where: { id: taskId }, data: { title: newText } })
    );
    await ctx.reply("✅ Задача обновлена");
    
  } else if (action === "edit_status") {
    const statusKb = new InlineKeyboard()
      .text("TODO (К выполнению)", "TODO").row()
      .text("IN_PROGRESS (В процессе)", "IN_PROGRESS").row()
      .text("DONE (Выполнено)", "DONE");

    await ctx.reply("Выбери новый статус:", { reply_markup: statusKb });
    const statusCtx = await conversation.waitForCallbackQuery(["TODO", "IN_PROGRESS", "DONE"]);
    const newStatus = statusCtx.callbackQuery.data;
    await statusCtx.answerCallbackQuery();

    await conversation.external(() => 
      prisma.task.update({ where: { id: taskId }, data: { status: newStatus as any } })
    );
    await ctx.reply("✅ Задача обновлена");
  }
}