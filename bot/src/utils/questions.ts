import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext } from "../index";
import { MENU_TRIGGERS } from "../index";

export async function askQuestionHelper(conversation: Conversation<MyContext>, ctx: MyContext, q: any): Promise<string> {
  if (q.type === "YES_NO") {
    const kb = new InlineKeyboard().text("✅ Да", "yes").text("❌ Нет", "no");
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(["yes", "no"]);
    
    // УДАЛЯЕМ СООБЩЕНИЕ ПОСЛЕ ОТВЕТА
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    try { await resp.answerCallbackQuery(); } catch (e) {}
    return resp.match === "yes" ? "Да" : "Нет";
  } 
  else if (q.type === "SELECT") {
    const kb = new InlineKeyboard();
    q.options.forEach((opt: string, idx: number) => kb.text(opt, `sel_${idx}`).row());
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(/sel_\d+/);
    
    // УДАЛЯЕМ СООБЩЕНИЕ ПОСЛЕ ОТВЕТА
    await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
    
    const idx = parseInt(resp.callbackQuery.data.replace("sel_", ""));
    try { await resp.answerCallbackQuery(); } catch (e) {}
    return q.options[idx];
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
      return kb;
    };

    const msg = await ctx.reply(q.text + "\n*(Можно выбрать несколько вариантов)*", { reply_markup: buildKb(), parse_mode: "Markdown" });
    msgId = msg.message_id;

    while (true) {
      const resp = await conversation.waitForCallbackQuery(/msel_\d+|submit_multi/);
      const data = resp.callbackQuery.data;
      
      if (data === "submit_multi") {
        // УДАЛЯЕМ СООБЩЕНИЕ ПОСЛЕ НАЖАТИЯ "ГОТОВО"
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
    return selected.length > 0 ? selected.join(", ") : "Ничего не выбрано";
  }
  else {
    // TEXT, NUMBER, TIME
    await ctx.reply(q.text);
    const resp = await conversation.waitFor("message:text");
    
    if (resp.message?.text && MENU_TRIGGERS.includes(resp.message.text)) {
      await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
      return "_CANCEL_";
    }

    return resp.message!.text!.trim();
  }
}