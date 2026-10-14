import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"; 
import { analyzeEveningReport, transcribeAudio } from "@standup/shared";

type DraftTask = {
  refId: number;
  originalId?: string;
  action: "DONE" | "POSTPONE" | "CREATE_DONE" | "CREATE_OPEN";
  title: string;
  projectId?: string | null;
};

export async function eveningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id }, include: { roles: true } })
  );
  if (!user) return;

  const openTasks = await conversation.external(() => 
    prisma.task.findMany({ 
      where: { status: { not: "DONE" }, OR: [{ assigneeId: user.id }, { assigneeId: null, createdById: user.id }] },
      include: { project: true }
    })
  );

  const projects = await conversation.external(() => 
    prisma.project.findMany({ where: { users: { some: { id: user.id } }, isActive: true } })
  );

  let draftTasks: DraftTask[] = [];
  let summaryText = "";
  let refCounter = 1;

  // Функция для отрисовки черновика
  const renderDraft = async (msgToEdit?: number) => {
    let text = "📋 *Предварительный итог дня:*\n\n";
    if (draftTasks.length === 0) text += "Пока нет задач.\n";
    
    draftTasks.forEach(t => {
      const icon = (t.action === "DONE" || t.action === "CREATE_DONE") ? "✅" : (t.action === "POSTPONE" ? "➡️" : "🆕");
      const pName = projects.find(p => p.id === t.projectId)?.name || "Без проекта";
      text += `${t.refId}. ${icon} [${pName}] ${t.title}\n`;
    });
    if (summaryText) text += `\n📝 Итог: ${summaryText}`;

    const kb = new InlineKeyboard();
    draftTasks.forEach(t => {
      const toggleAction = (t.action === "DONE" || t.action === "CREATE_DONE") ? "postpone" : "done";
      const toggleIcon = toggleAction === "postpone" ? "➡️ Перенести" : "✅ Выполнить";
      kb.text(`🗑 Удалить ${t.refId}`, `draft_del_${t.refId}`).text(`${toggleIcon} ${t.refId}`, `draft_tog_${t.refId}`).row();
    });
    kb.text("✅ Всё верно (Сохранить)", "draft_save").row();
    kb.text("🎙 Добавить ещё (Голос/Текст)", "draft_add").row();
    kb.text("❌ Отмена", "cancel_flow");

    if (msgToEdit) {
      await ctx.api.editMessageText(ctx.chat!.id, msgToEdit, text, { reply_markup: kb, parse_mode: "Markdown" }).catch(()=>{});
      return msgToEdit;
    } else {
      const sent = await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
      return sent.message_id;
    }
  };

  await ctx.reply("🌆 Рабочий день подошёл к концу. Расскажи голосовым сообщением или текстом, что успел сделать, что переносится на потом и какие новые задачи появились.\n(или нажми /menu для отмены)");

  // ГЛАВНЫЙ ЦИКЛ СБОРА И РЕДАКТИРОВАНИЯ
  let isEditing = true;
  let currentDraftMsgId: number | undefined = undefined;

  while (isEditing) {
    // Ждём либо текст/голос, либо клик по кнопкам черновика
    const inputCtx = await conversation.waitFor(["message:text", "message:voice", "callback_query:data"]);

    // ОБРАБОТКА КНОПОК ЧЕРНОВИКА
    if (inputCtx.has("callback_query:data")) {
      const data = inputCtx.callbackQuery.data;
      try { await inputCtx.answerCallbackQuery(); } catch(e){}

      if (data === "cancel_flow") {
        if (currentDraftMsgId) await ctx.api.deleteMessage(ctx.chat!.id, currentDraftMsgId).catch(()=>{});
        await ctx.reply("❌ Отменено.");
        return;
      }
      
      if (data === "draft_save") {
        if (currentDraftMsgId) await ctx.api.editMessageReplyMarkup(ctx.chat!.id, currentDraftMsgId, { reply_markup: undefined }).catch(()=>{});
        isEditing = false;
        break;
      }

      if (data === "draft_add") {
        if (currentDraftMsgId) await ctx.api.deleteMessage(ctx.chat!.id, currentDraftMsgId).catch(()=>{});
        await ctx.reply("Слушаю! Жду голосовое или текст...");
        continue;
      }

      if (data.startsWith("draft_del_")) {
        const id = parseInt(data.replace("draft_del_", ""));
        draftTasks = draftTasks.filter(t => t.refId !== id);
        currentDraftMsgId = await renderDraft(currentDraftMsgId);
        continue;
      }

      if (data.startsWith("draft_tog_")) {
        const id = parseInt(data.replace("draft_tog_", ""));
        const task = draftTasks.find(t => t.refId === id);
        if (task) {
          if (task.action === "DONE") task.action = "POSTPONE";
          else if (task.action === "POSTPONE") task.action = "DONE";
          else if (task.action === "CREATE_DONE") task.action = "CREATE_OPEN";
          else if (task.action === "CREATE_OPEN") task.action = "CREATE_DONE";
        }
        currentDraftMsgId = await renderDraft(currentDraftMsgId);
        continue;
      }
    }

    // ОБРАБОТКА ВВОДА (ГОЛОС / ТЕКСТ)
    if (inputCtx.message) {
      if (currentDraftMsgId) {
        await ctx.api.deleteMessage(ctx.chat!.id, currentDraftMsgId).catch(()=>{});
        currentDraftMsgId = undefined;
      }

      if (inputCtx.message.text && MENU_TRIGGERS.includes(inputCtx.message.text)) {
        await ctx.reply("Отменил чек-ин.");
        return;
      }

      const waitMsg = await ctx.reply("⏳ Расшифровываю и анализирую...");
      let transcript = "";

      if (inputCtx.message.voice) {
        const file = await inputCtx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        try {
          const audioResp = await conversation.external(() => fetch(fileUrl));
          const audioBase64 = Buffer.from(await conversation.external(() => audioResp.arrayBuffer())).toString("base64");
          transcript = await conversation.external(() => transcribeAudio(audioBase64));
          await ctx.reply(`🎤 Понял: «${transcript}»`);
        } catch (e) {
          await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(()=>{});
          await ctx.reply("Не смог расшифровать аудио. Попробуй ещё раз или напиши текстом.");
          continue;
        }
      } else {
        transcript = inputCtx.message.text || "";
      }

      if (!transcript.trim()) continue;

      // Анализ через ИИ
      try {
        const analysis = await conversation.external(() => analyzeEveningReport(transcript, openTasks, projects));
        
        // Добавляем в черновик
        if (summaryText) summaryText += " " + analysis.summary;
        else summaryText = analysis.summary;

        analysis.markDoneIds?.forEach((id: string) => {
          const t = openTasks.find(o => o.id === id);
          if (t && !draftTasks.some(d => d.originalId === id)) {
            draftTasks.push({ refId: refCounter++, originalId: t.id, action: "DONE", title: t.title, projectId: t.projectId });
          }
        });

        analysis.postponeIds?.forEach((id: string) => {
          const t = openTasks.find(o => o.id === id);
          if (t && !draftTasks.some(d => d.originalId === id)) {
            draftTasks.push({ refId: refCounter++, originalId: t.id, action: "POSTPONE", title: t.title, projectId: t.projectId });
          }
        });

        analysis.createNewDone?.forEach((t: any) => {
          draftTasks.push({ refId: refCounter++, action: "CREATE_DONE", title: t.title, projectId: t.projectId });
        });

        analysis.createNewOpen?.forEach((t: any) => {
          draftTasks.push({ refId: refCounter++, action: "CREATE_OPEN", title: t.title, projectId: t.projectId });
        });

        // Обработка неясных задач (Уточнения)
        if (analysis.unclearTasks && analysis.unclearTasks.length > 0) {
          for (const unclear of analysis.unclearTasks) {
            const pkKb = new InlineKeyboard();
            projects.forEach(p => pkKb.text(p.name, `uc_proj_${p.id}`).row());
            pkKb.text("🙋 Без проекта", "uc_proj_null").row().text("🗑 Не добавлять", "uc_skip");

            const ucMsg = await ctx.reply(`Не понял, к какому проекту отнести задачу: «${unclear.title}». Выбери:`, { reply_markup: pkKb });
            const ucResp = await conversation.waitForCallbackQuery(/uc_proj_.+|uc_skip/);
            try { await ucResp.answerCallbackQuery(); } catch(e){}
            await ctx.api.deleteMessage(ctx.chat!.id, ucMsg.message_id).catch(()=>{});

            if (ucResp.callbackQuery.data !== "uc_skip") {
              const pId = ucResp.callbackQuery.data.replace("uc_proj_", "");
              draftTasks.push({ refId: refCounter++, action: "CREATE_DONE", title: unclear.title, projectId: pId === "null" ? null : pId });
            }
          }
        }

      } catch (e) {
        console.error("AI Error:", e);
        await ctx.reply("Произошла ошибка при анализе ИИ. Попробуй описать проще.");
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(()=>{});
      currentDraftMsgId = await renderDraft();
    }
  }

  // === 3. СОХРАНЕНИЕ В БД ===
  const savingMsg = await ctx.reply("⏳ Сохраняю итоги...");

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "EVENING" } })
  );

  if (summaryText) {
    await conversation.external(() => 
      prisma.answer.create({ data: { userId: user.id, checkInId: checkIn.id, value: summaryText } })
    );
  }

  await conversation.external(async () => {
    for (const t of draftTasks) {
      if (t.action === "DONE" && t.originalId) {
        await prisma.task.update({ where: { id: t.originalId }, data: { status: "DONE" } });
      } else if (t.action === "CREATE_DONE") {
        await prisma.task.create({ data: { title: t.title, projectId: t.projectId, assigneeId: user.id, createdById: user.id, status: "DONE" } });
      } else if (t.action === "CREATE_OPEN") {
        await prisma.task.create({ data: { title: t.title, projectId: t.projectId, assigneeId: user.id, createdById: user.id, status: "TODO" } });
      }
      // POSTPONE ничего не делает с БД, задача просто остаётся открытой
    }
  });

  await ctx.api.deleteMessage(ctx.chat!.id, savingMsg.message_id).catch(()=>{});
  await ctx.reply("✨ Итоги дня успешно сохранены! Отдыхай.");

  // --- ПОДСЧЕТ СЕРИИ БЕЗ ПРОПУСКОВ ---
  try {
    const now = new Date();
    const todayStr = formatInTimeZone(now, user.timezone, "yyyy-MM-dd");
    const startOfToday = fromZonedTime(`${todayStr} 00:00:00`, user.timezone);

    const todayEveningCount = await conversation.external(() => 
      prisma.checkIn.count({ where: { userId: user.id, type: "EVENING", createdAt: { gte: startOfToday } } })
    );

    if (todayEveningCount === 1) {
      let prevDate = now;
      let prevDayFound = false;

      for (let i = 1; i <= 14; i++) {
        prevDate = subDays(now, i);
        const day = parseInt(formatInTimeZone(prevDate, user.timezone, 'i'));
        if (user.workDays.includes(day)) {
          prevDayFound = true;
          break;
        }
      }

      if (prevDayFound) {
        const prevDateString = formatInTimeZone(prevDate, user.timezone, "yyyy-MM-dd");
        const startOfPrev = fromZonedTime(`${prevDateString} 00:00:00`, user.timezone);
        const endOfPrev = fromZonedTime(`${prevDateString} 23:59:59`, user.timezone);

        const hasPrevCheckIn = await conversation.external(() => 
          prisma.checkIn.findFirst({ where: { userId: user.id, type: "EVENING", createdAt: { gte: startOfPrev, lte: endOfPrev } } })
        );

        const newStreak = hasPrevCheckIn ? user.streakCount + 1 : 1;
        await conversation.external(() => prisma.user.update({ where: { id: user.id }, data: { streakCount: newStreak } }));

        if (newStreak >= 2) await ctx.reply(`🔥 ${newStreak} дней подряд без пропусков! Красавчик!`);
      } else {
        await conversation.external(() => prisma.user.update({ where: { id: user.id }, data: { streakCount: 1 } }));
      }
    }
  } catch (err) {}
}