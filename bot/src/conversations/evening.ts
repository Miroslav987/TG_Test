import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma, MENU_TRIGGERS } from "../index";
import { subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"; 

export async function eveningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "EVENING" } })
  );

  const openTasks = await conversation.external(() => 
    prisma.task.findMany({ 
      where: { 
        status: { not: "DONE" },
        OR: [{ assigneeId: user.id }, { assigneeId: null, createdById: user.id }]
      },
      include: { project: true }
    })
  );

  if (openTasks.length > 0) {
    await ctx.reply("Давай актуализируем статусы твоих задач:");
    
    for (const task of openTasks) {
      const kb = new InlineKeyboard()
        .text("✅ Сделано", "DONE").row()
        .text("🔄 В процессе", "IN_PROGRESS").row()
        .text("⛔ Блокер", "BLOCKED").row()
        .text("❌ Отмена", "cancel_flow");

      const projName = task.project?.name ?? "Без проекта";
      const msg = await ctx.reply(`Задача: [${projName}] ${task.title}\nКакой статус?`, { reply_markup: kb });
      
      const statusCtx = await conversation.waitForCallbackQuery(["DONE", "IN_PROGRESS", "BLOCKED", "cancel_flow"]);
      const newStatus = statusCtx.callbackQuery.data;
      
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
      try { await statusCtx.answerCallbackQuery(); } catch (e) {}

      if (newStatus === "cancel_flow") {
        await ctx.reply("❌ Отменено.");
        return;
      }

      await conversation.external(() => 
        prisma.task.update({ where: { id: task.id }, data: { status: newStatus as any } })
      );

      if (newStatus === "BLOCKED") {
        await ctx.reply("Что мешает выполнению? (опиши причину)\n(или напиши /menu, чтобы отменить)");
        const blockerCtx = await conversation.waitFor("message:text");
        
        if (blockerCtx.message?.text && MENU_TRIGGERS.includes(blockerCtx.message.text)) {
          await ctx.reply("Отменил текущее действие.");
          return;
        }

        await conversation.external(() => 
          prisma.answer.create({ 
            data: { 
              userId: user.id, checkInId: checkIn.id, 
              value: `Блокер по задаче '${task.title}': ${blockerCtx.message!.text}` 
            } 
          })
        );
      }
    }
    await ctx.reply("✨ Статусы задач обновлены! Итоги дня записаны.");
  } else {
    await ctx.reply("✨ Сегодня у тебя не было открытых задач. Итоги дня отмечены, отдыхай!");
  }

  // --- ПОДСЧЕТ СЕРИИ БЕЗ ПРОПУСКОВ ---
  try {
    const now = new Date();
    const todayStr = formatInTimeZone(now, user.timezone, "yyyy-MM-dd");
    const startOfToday = fromZonedTime(`${todayStr} 00:00:00`, user.timezone);

    const todayEveningCount = await conversation.external(() => 
      prisma.checkIn.count({
        where: { userId: user.id, type: "EVENING", createdAt: { gte: startOfToday } }
      })
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
          prisma.checkIn.findFirst({
            where: { userId: user.id, type: "EVENING", createdAt: { gte: startOfPrev, lte: endOfPrev } }
          })
        );

        const newStreak = hasPrevCheckIn ? user.streakCount + 1 : 1;
        await conversation.external(() => 
          prisma.user.update({ where: { id: user.id }, data: { streakCount: newStreak } })
        );

        if (newStreak >= 2) {
          await ctx.reply(`🔥 ${newStreak} дней подряд без пропусков! Красавчик!`);
        }
      } else {
        await conversation.external(() => 
          prisma.user.update({ where: { id: user.id }, data: { streakCount: 1 } })
        );
      }
    }
  } catch (err) {
    console.error("Ошибка при подсчете стриков:", err);
  }
}