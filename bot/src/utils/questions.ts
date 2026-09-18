import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext } from "../index";

export async function askQuestionHelper(conversation: Conversation<MyContext>, ctx: MyContext, q: any): Promise<string> {
  if (q.type === "YES_NO") {
    const kb = new InlineKeyboard().text("✅ Да", "yes").text("❌ Нет", "no");
    // Сохраняем msg для удаления кнопок
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(["yes", "no"]);
    
    // Убираем инлайн-клавиатуру, заменяя её на пустую
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id, { reply_markup: new InlineKeyboard() });
    await resp.answerCallbackQuery();
    return resp.match === "yes" ? "Да" : "Нет";
  } 
  else if (q.type === "SELECT") {
    const kb = new InlineKeyboard();
    q.options.forEach((opt: string, idx: number) => kb.text(opt, `sel_${idx}`).row());
    const msg = await ctx.reply(q.text, { reply_markup: kb });
    const resp = await conversation.waitForCallbackQuery(/sel_\d+/);
    
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id, { reply_markup: new InlineKeyboard() });
    
    const idx = parseInt(resp.callbackQuery.data.replace("sel_", ""));
    await resp.answerCallbackQuery();
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
        // Убираем кнопки после нажатия "Готово"
        await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msgId, { reply_markup: new InlineKeyboard() });
        await resp.answerCallbackQuery();
        break;
      } else {
        const idx = parseInt(data.replace("msel_", ""));
        const opt = q.options[idx];
        if (selected.includes(opt)) {
          selected = selected.filter(x => x !== opt); // Снимаем галочку
        } else {
          selected.push(opt); // Ставим галочку
        }
        
        await resp.answerCallbackQuery();
        await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msgId, { reply_markup: buildKb() });
      }
    }
    return selected.length > 0 ? selected.join(", ") : "Ничего не выбрано";
  }
  else {
    // TEXT, NUMBER, TIME
    await ctx.reply(q.text);
    const resp = await conversation.waitFor("message:text");
    return resp.message!.text!.trim();
  }
}