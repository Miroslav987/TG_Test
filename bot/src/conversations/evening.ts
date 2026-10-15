import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"; 
import { analyzeEveningReport } from "@standup/shared";

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
  let projectSelectionForRef: number | null = null; // Для переключения клавиатуры на выбор проекта

  const renderDraft = async (msgToEdit?: number) => {
    let text = "📋 Предварительный итог дня\n";
    
    if (draftTasks.length === 0) {
      text += "\nПока нет задач.\n";
    } else {
      const doneTasks = draftTasks.filter(t => t.action === "DONE");
      const createDoneTasks = draftTasks.filter(t => t.action === "CREATE_DONE");
      const createOpenTasks = draftTasks.filter(t => t.action === "CREATE_OPEN");
      const postponeTasks = draftTasks.filter(t => t.action === "POSTPONE");

      const formatTask = (t: DraftTask) => {
        const pName = projects.find(p => p.id === t.projectId)?.name || "Без проекта";
        return `   ${t.refId}. ${t.title} — ${pName}`;
      };

      if (doneTasks.length > 0) {
        text += "\n✅ Закрою существующие задачи:\n" + doneTasks.map(formatTask).join("\n");
      }
      if (createDoneTasks.length > 0) {
        text += "\n\n🆕 Создам новые (сразу выполненные):\n" + createDoneTasks.map(formatTask).join("\n");
      }
      if (createOpenTasks.length > 0) {
        text += "\n\n🆕 Создам новые (на будущее):\n" + createOpenTasks.map(formatTask).join("\n");
      }
      if (postponeTasks.length > 0) {
        text += "\n\n➡️ Остаются открытыми:\n" + postponeTasks.map(formatTask).join("\n");
      }
    }

    if (summaryText) text += `\n\n📝 Итог: ${summaryText}`;

    const kb = new InlineKeyboard();

    if (projectSelectionForRef !== null) {
      // Режим выбора проекта для конкретной задачи
      projects.forEach(p => kb.text(p.name, `dsp_${projectSelectionForRef}_${p.id}`).row());
      kb.text("🙋 Без проекта", `dsp_${projectSelectionForRef}_null`).row();
      kb.text("↩️ Назад", "draft_back").row();
    } else {
      // Стандартный режим черновика
      draftTasks.forEach(t => {
        const toggleAction = (t.action === "DONE" || t.action === "CREATE_DONE") ? "postpone" : "done";
        const toggleIcon = toggleAction === "postpone" ? "➡️ Перенести" : "✅ Выполнить";
        
        kb.text(`🗑 Удалить ${t.refId}`, `draft_del_${t.refId}`);
        if (t.action === "CREATE_DONE" || t.action === "CREATE_OPEN") {
          kb.text(`📂 ${t.refId}`, `draft_proj_${t.refId}`);
        }
        kb.text(`${toggleIcon} ${t.refId}`, `draft_tog_${t.refId}`).row();
      });
      kb.text("✅ Всё верно (Сохранить)", "draft_save").row();
      kb.text("🎙 Добавить ещё (Голос/Текст)", "draft_add").row();
      kb.text("❌ Отмена", "cancel_flow");
    }

    if (msgToEdit) {
      try {
        await ctx.api.editMessageText(ctx.chat!.id, msgToEdit, text, { reply_markup: kb });
        return msgToEdit;
      } catch (e) {
        await ctx.api.deleteMessage(ctx.chat!.id, msgToEdit).catch(() => {});
        const sent = await ctx.reply(text, { reply_markup: kb });
        return sent.message_id;
      }
    } else {
      const sent = await ctx.reply(text, { reply_markup: kb });
      return sent.message_id;
    }
  };

  await ctx.reply("🌆 Рабочий день подошёл к концу. Расскажи голосовым сообщением или текстом, что успел сделать, что переносится на потом и какие новые задачи появились.\n(или нажми /menu для отмены)");

  let isEditing = true;
  let currentDraftMsgId: number | undefined = undefined;

  while (isEditing) {
    const inputCtx = await conversation.waitFor(["message:text", "message:voice", "callback_query:data"]);

    // === ОБРАБОТКА КНОПОК ЧЕРНОВИКА ===
    if (inputCtx.has("callback_query:data")) {
      const data = inputCtx.callbackQuery.data;
      try { await inputCtx.answerCallbackQuery(); } catch(e){}

      if (data === "cancel_flow") {
        if (currentDraftMsgId) await ctx.api.deleteMessage(ctx.chat!.id, currentDraftMsgId).catch(()=>{});
        await ctx.reply("❌ Отменено.");
        return;
      }
      
      if (data === "draft_save") {
        const saveMsg = await ctx.reply("⏳ Сохраняю итоги...");
        
        const saveResult = await conversation.external(async () => {
          try {
            await prisma.$transaction(async (tx) => {
              const checkIn = await tx.checkIn.create({ data: { userId: user.id, type: "EVENING" } });
              if (summaryText) {
                await tx.answer.create({ data: { userId: user.id, checkInId: checkIn.id, value: summaryText } });
              }
              for (const t of draftTasks) {
                if (t.action === "DONE" && t.originalId) {
                  await tx.task.update({ where: { id: t.originalId }, data: { status: "DONE" } });
                } else if (t.action === "CREATE_DONE") {
                  await tx.task.create({ data: { title: t.title, projectId: t.projectId, assigneeId: user.id, createdById: user.id, status: "DONE" } });
                } else if (t.action === "CREATE_OPEN") {
                  await tx.task.create({ data: { title: t.title, projectId: t.projectId, assigneeId: user.id, createdById: user.id, status: "TODO" } });
                }
              }
            });
            return { ok: true };
          } catch (e) {
            console.error("DB Save Error:", e);
            return { ok: false };
          }
        });

        await ctx.api.deleteMessage(ctx.chat!.id, saveMsg.message_id).catch(()=>{});

        if (!saveResult.ok) {
          await ctx.reply("⚠️ Не получилось сохранить, черновик на месте. Нажми «Сохранить» ещё раз.");
          currentDraftMsgId = await renderDraft(currentDraftMsgId);
          continue;
        } else {
          if (currentDraftMsgId) await ctx.api.editMessageReplyMarkup(ctx.chat!.id, currentDraftMsgId, { reply_markup: undefined }).catch(()=>{});
          isEditing = false;
          break;
        }
      }

      if (data === "draft_add") {
        if (currentDraftMsgId) await ctx.api.deleteMessage(ctx.chat!.id, currentDraftMsgId).catch(()=>{});
        await ctx.reply("Слушаю! Жду голосовое или текст...");
        continue;
      }

      // Новые обработчики для проекта
      if (data.startsWith("draft_proj_")) {
        projectSelectionForRef = parseInt(data.replace("draft_proj_", ""));
        currentDraftMsgId = await renderDraft(currentDraftMsgId);
        continue;
      }

      if (data === "draft_back") {
        projectSelectionForRef = null;
        currentDraftMsgId = await renderDraft(currentDraftMsgId);
        continue;
      }

      if (data.startsWith("dsp_")) {
        const parts = data.split("_");
        const id = parseInt(parts[1]);
        const pIdStr = parts.slice(2).join("_");
        const pId = pIdStr === "null" ? null : pIdStr;
        
        if (pId === null || projects.some(p => p.id === pId)) {
          const task = draftTasks.find(t => t.refId === id);
          if (task) task.projectId = pId;
        }
        
        projectSelectionForRef = null;
        currentDraftMsgId = await renderDraft(currentDraftMsgId);
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

    // === ОБРАБОТКА ВВОДА (ГОЛОС / ТЕКСТ) ===
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
        try {
          transcript = await conversation.external(async () => {
            const file = await inputCtx.getFile();
            const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("download failed");
            const b64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
            const { transcribeAudio } = require("@standup/shared");
            return await transcribeAudio(b64);
          });
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
        
        if (summaryText) summaryText += " " + analysis.summary;
        else summaryText = analysis.summary;

        const validIds = new Set(projects.map(p => p.id));
        const unclearQueue: { title: string, action: "CREATE_DONE" | "CREATE_OPEN" }[] = [];

        const processProject = (pId: any) => {
          if (!pId || pId === "" || pId === "null") return null;
          if (validIds.has(pId)) return pId;
          return "INVALID";
        };

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
          const pid = processProject(t.projectId);
          if (pid === "INVALID") unclearQueue.push({ title: t.title, action: "CREATE_DONE" });
          else draftTasks.push({ refId: refCounter++, action: "CREATE_DONE", title: t.title, projectId: pid });
        });

        analysis.createNewOpen?.forEach((t: any) => {
          const pid = processProject(t.projectId);
          if (pid === "INVALID") unclearQueue.push({ title: t.title, action: "CREATE_OPEN" });
          else draftTasks.push({ refId: refCounter++, action: "CREATE_OPEN", title: t.title, projectId: pid });
        });

        analysis.unclearTasks?.forEach((u: any) => {
          unclearQueue.push({ title: u.title, action: "CREATE_DONE" });
        });

        if (unclearQueue.length > 0) {
          let cancelled = false;
          for (const unclear of unclearQueue) {
            let resolved = false;
            while (!resolved) {
              const pkKb = new InlineKeyboard();
              projects.forEach(p => pkKb.text(p.name, `uc_proj_${p.id}`).row());
              pkKb.text("🙋 Без проекта", "uc_proj_null").row();
              pkKb.text("🗑 Не добавлять", "uc_skip").row();
              pkKb.text("❌ Отменить отчёт", "cancel_flow");

              const ucMsg = await ctx.reply(`Не понял, к какому проекту отнести задачу: «${unclear.title}». Выбери:`, { reply_markup: pkKb });
              const ucResp = await conversation.waitFor(["callback_query:data", "message:text"]);

              if (ucResp.message?.text) {
                await ctx.api.deleteMessage(ctx.chat!.id, ucMsg.message_id).catch(()=>{});
                await ctx.reply("Выбери проект кнопкой или нажми ❌ Отменить отчёт.");
                continue;
              }

              if (ucResp.has("callback_query:data")) {
                const data = ucResp.callbackQuery.data;
                await ctx.api.deleteMessage(ctx.chat!.id, ucMsg.message_id).catch(()=>{});
                try { await ucResp.answerCallbackQuery(); } catch(e){}

                if (data === "cancel_flow") {
                  await ctx.reply("❌ Отменено.");
                  cancelled = true;
                  break; 
                }

                if (data !== "uc_skip") {
                  const pId = data.replace("uc_proj_", "");
                  draftTasks.push({ refId: refCounter++, action: unclear.action, title: unclear.title, projectId: pId === "null" ? null : pId });
                }
                resolved = true;
              }
            }
            if (cancelled) break; 
          }
          if (cancelled) return; 
        }

      } catch (e) {
        console.error("AI Error:", e);
        await ctx.reply("Произошла ошибка при анализе ИИ. Попробуй описать проще.");
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(()=>{});
      currentDraftMsgId = await renderDraft();
    }
  }

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