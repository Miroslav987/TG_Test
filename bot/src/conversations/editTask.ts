import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";

export async function editTaskConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
  taskId: string          // ← принимаем напрямую, а не из ctx.session
) {
  if (!taskId) return;

  const task = await conversation.external(() =>
    prisma.task.findUnique({ where: { id: taskId }, include: { project: true } })
  );

  if (!task) {
    await ctx.reply("Задача не найдена или уже удалена.");
    return;
  }

  const kb = new InlineKeyboard()
    .text("📝 Изменить текст", "edit_text").row()
    .text("🔄 Изменить статус", "edit_status").row()
    .text("❌ Отмена", "cancel");

  const projName = task.project?.name ?? "личная";
  await ctx.reply(`Что изменить в задаче «${task.title}» (${projName})?`, { reply_markup: kb });

  const actionCtx = await conversation.waitForCallbackQuery(["edit_text", "edit_status", "cancel"]);
  const action = actionCtx.callbackQuery.data;
  try { await actionCtx.answerCallbackQuery(); } catch (e) {}

  if (action === "cancel") {
    await ctx.reply("Отменено.");
    return;
  }

  if (action === "edit_text") {
    await ctx.reply("Введи новый текст задачи:");
    const textCtx = await conversation.waitFor("message:text");

    if (textCtx.message?.text && MENU_TRIGGERS.includes(textCtx.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      return;
    }

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
    try { await statusCtx.answerCallbackQuery(); } catch (e) {}

    await conversation.external(() =>
      prisma.task.update({ where: { id: taskId }, data: { status: newStatus as any } })
    );
    await ctx.reply("✅ Задача обновлена");
  }
}