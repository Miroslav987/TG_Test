import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";
import { sendTelegramMessage } from "@standup/shared"; // <-- ДОБАВЛЕНО

export async function newProjectConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("Как назвать проект?");
  
  const nameCtx = await conversation.waitFor("message:text");

  if (nameCtx.message?.text && MENU_TRIGGERS.includes(nameCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  const name = nameCtx.message!.text.trim();
  if (!name) {
    await ctx.reply("Название не может быть пустым. Отмена.");
    return;
  }

  const project = await conversation.external(() => 
    prisma.project.create({
      data: { name, tasksRequired: true, users: { connect: { id: user.id } } }
    })
  );

  // === НОВЫЙ БЛОК ДОБАВЛЕНИЯ УЧАСТНИКОВ ===
  const activeUsers = await conversation.external(() =>
    prisma.user.findMany({ where: { isActive: true, id: { not: user.id } } })
  );

  if (activeUsers.length > 0) {
    let selectedIds: string[] = [];
    let msgId = 0;
    
    const buildKb = () => {
      const kb = new InlineKeyboard();
      activeUsers.forEach(u => {
        const check = selectedIds.includes(u.id) ? "✅ " : "";
        kb.text(`${check}${u.name}`, `addU_${u.id}`).row();
      });
      kb.text("➡️ Готово", "submit_users").row();
      return kb;
    };

    const msg = await ctx.reply("Добавить в проект ещё кого-то? (необязательно)", { reply_markup: buildKb() });
    msgId = msg.message_id;

    while (true) {
      const resp = await conversation.waitForCallbackQuery(/addU_.+|submit_users/);
      const data = resp.callbackQuery.data;
      
      if (data === "submit_users") {
        await ctx.api.deleteMessage(ctx.chat!.id, msgId).catch(() => {});
        try { await resp.answerCallbackQuery(); } catch (e) {}
        break;
      } else {
        const uId = data.replace("addU_", "");
        if (selectedIds.includes(uId)) {
          selectedIds = selectedIds.filter(id => id !== uId);
        } else {
          selectedIds.push(uId);
        }
        
        try { await resp.answerCallbackQuery(); } catch (e) {}
        await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msgId, { reply_markup: buildKb() });
      }
    }

    if (selectedIds.length > 0) {
      await conversation.external(() => 
        prisma.project.update({
          where: { id: project.id },
          data: { users: { connect: selectedIds.map(id => ({ id })) } }
        })
      );

      // Уведомляем добавленных сотрудников
      const usersToNotify = activeUsers.filter(u => selectedIds.includes(u.id));
      for (const u of usersToNotify) {
        if (u.telegramId) {
          await conversation.external(() => 
            sendTelegramMessage(u.telegramId!, `📂 Тебя добавили в проект «*${name}*»`)
          );
        }
      }
    }
  }

  // Финальное сообщение
  await ctx.reply(`✅ Проект «${name}» создан, ты в нём участник.`, {
    reply_markup: {
      inline_keyboard: [[{ text: "🗑 Удалить проект", callback_data: `del_project_${project.id}` }]]
    }
  });
}