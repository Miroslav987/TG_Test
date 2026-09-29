import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";

export async function customQuestionConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const questionId = 
    ctx.match?.[1] || 
    ctx.callbackQuery?.data?.replace("ans_custom_", "") || 
    ctx.session?.customQuestionId;
    
  const promptMessageId = 
    ctx.callbackQuery?.message?.message_id || 
    ctx.session?.promptMessageId;

  if (!questionId) return;

  const q = await conversation.external(() => prisma.question.findUnique({ where: { id: questionId } }));
  const user = await conversation.external(() => prisma.user.findUnique({ where: { telegramId: ctx.from?.id } }));
  if (!q || !user) return;

  let answerVal = "";

  if (q.type === "YES_NO") {
    const kb = new InlineKeyboard()
      .text("✅ Да", "yes").text("❌ Нет", "no").row()
      .text("❌ Отмена", "cancel_flow");
      
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(["yes", "no", "cancel_flow"]);
    
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    try { await resp.answerCallbackQuery(); } catch (e) {}

    if (resp.match === "cancel_flow") {
      await ctx.reply("❌ Отменил ответ на вопрос.");
      if (promptMessageId) await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
      ctx.session.promptMessageId = undefined;
      ctx.session.customQuestionId = undefined;
      return;
    }

    answerVal = resp.match === "yes" ? "Да" : "Нет";
  } 
  else if (q.type === "SELECT") {
    const kb = new InlineKeyboard();
    q.options.forEach((opt: string, idx: number) => kb.text(opt, `sel_${idx}`).row());
    kb.text("❌ Отмена", "cancel_flow");
    
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(/sel_\d+|cancel_flow/);
    
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    try { await resp.answerCallbackQuery(); } catch (e) {}

    if (resp.callbackQuery.data === "cancel_flow") {
      await ctx.reply("❌ Отменил ответ на вопрос.");
      if (promptMessageId) await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
      ctx.session.promptMessageId = undefined;
      ctx.session.customQuestionId = undefined;
      return;
    }
    
    const idx = parseInt(resp.callbackQuery.data.replace("sel_", ""));
    answerVal = q.options[idx];
  }
  else if (q.type === "MULTI_SELECT") {
    let selected: string[] = [];
    let msgId = 0;
    
    const buildKb = () => {
      const kb = new InlineKeyboard();
      q.options.forEach((opt: string, idx: number) => {
        const check = selected.includes(opt) ? "✅ " : "";
        kb.text(`${check}${opt}`, `msel_${idx}`).row();
      });
      kb.text("➡️ Готово (Отправить)", "submit_multi").row();
      kb.text("❌ Отмена", "cancel_flow");
      return kb;
    };

    const msg = await ctx.reply(q.text + "\n*(Можно выбрать несколько вариантов)*", { reply_markup: buildKb(), parse_mode: "Markdown" });
    msgId = msg.message_id;

    while (true) {
      const resp = await conversation.waitForCallbackQuery(/msel_\d+|submit_multi|cancel_flow/);
      const data = resp.callbackQuery.data;
      
      if (data === "cancel_flow") {
        await ctx.api.deleteMessage(ctx.chat!.id, msgId).catch(() => {});
        try { await resp.answerCallbackQuery(); } catch (e) {}
        await ctx.reply("❌ Отменил ответ на вопрос.");
        if (promptMessageId) await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
        ctx.session.promptMessageId = undefined;
        ctx.session.customQuestionId = undefined;
        return;
      }

      if (data === "submit_multi") {
        await ctx.api.deleteMessage(ctx.chat!.id, msgId).catch(() => {});
        try { await resp.answerCallbackQuery(); } catch (e) {}
        break;
      } else {
        const idx = parseInt(data.replace("msel_", ""));
        const opt = q.options[idx];
        if (selected.includes(opt)) {
          selected = selected.filter(x => x !== opt);
        } else {
          selected.push(opt);
        }
        
        try { await resp.answerCallbackQuery(); } catch (e) {}
        await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msgId, { reply_markup: buildKb() });
      }
    }
    answerVal = selected.length > 0 ? selected.join(", ") : "Ничего не выбрано";
  }
  else {
    // TEXT, NUMBER, TIME (Свободный ввод без кнопок)
    await ctx.reply(q.text + "\n(или напиши /menu, чтобы отменить)");
    const resp = await conversation.waitFor("message:text");
    
    if (resp.message?.text && MENU_TRIGGERS.includes(resp.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      if (promptMessageId) await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
      ctx.session.promptMessageId = undefined;
      ctx.session.customQuestionId = undefined;
      return;
    }

    answerVal = resp.message!.text!.trim();
  }

  // Сохраняем ответ
  await conversation.external(() => 
    prisma.answer.create({ 
      data: { userId: user.id, questionId: q.id, value: answerVal } 
    })
  );

  await ctx.reply("✅ Ответ сохранен, спасибо!");

  // Удаляем исходное сообщение-приглашение с кнопкой "Ответить" (если оно было)
  if (promptMessageId) {
    await ctx.api.deleteMessage(ctx.chat!.id, promptMessageId).catch(() => {});
  }
  
  // Чистим сессию
  ctx.session.promptMessageId = undefined;
  ctx.session.customQuestionId = undefined;
}