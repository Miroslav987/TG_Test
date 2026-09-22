import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";

export async function editTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const taskId = ctx.match?.[1] || ctx.callbackQuery?.data?.replace("edit_task_", "");
  if (!taskId) return;

  const task = await conversation.external(() => 
    // ДОБАВЛЕНО: include: { project: true }
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

  // ДОБАВЛЕНО: Защита имени проекта
  const projName = task.project?.name ?? "личная";
  await ctx.reply(`Что изменить в задаче «${task.title}» (${projName})?`, { reply_markup: kb });

  const actionCtx = await conversation.waitForCallbackQuery(["edit_text", "edit_status", "cancel"]);
  const action = actionCtx.callbackQuery.data;
  try { await actionCtx.answerCallbackQuery(); } catch (e) {}

  if (action === "cancel") {
    await ctx.reply("Отменено.");
    return;
  }

  // ... (Остальной код редактирования текста и статуса без изменений) ...