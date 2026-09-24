import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";
import { askQuestionHelper } from "../utils/questions";
import { subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"; 

export async function eveningConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id }, include: { roles: true } })
  );
  if (!user) return;

  const checkIn = await conversation.external(() => 
    prisma.checkIn.create({ data: { userId: user.id, type: "EVENING" } })
  );

  const openTasks = await conversation.external(() => 
    prisma.task.findMany({ 
      where: { 
        status: { not: "DONE" },
        OR: [
          { assigneeId: user.id },
          { assigneeId: null, createdById: user.id } // <-- ИЗМЕНЕНО
        ]
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
        .text("⛔ Блокер", "BLOCKED");

      // ДОБАВЛЕНО: Защита имени проекта
      const projName = task.project?.name ?? "Без проекта";
      await ctx.reply(`Задача: [${projName}] ${task.title}\nКакой статус?`, { reply_markup: kb });
      
      const statusCtx = await conversation.waitForCallbackQuery(["DONE", "IN_PROGRESS", "BLOCKED"]);
      const newStatus = statusCtx.callbackQuery.data as "DONE" | "IN_PROGRESS" | "BLOCKED";
      try { await statusCtx.answerCallbackQuery(); } catch (e) {}

      await conversation.external(() => 
        prisma.task.update({ where: { id: task.id }, data: { status: newStatus } })
      );

      // Если блокер — спрашиваем почему
      if (newStatus === "BLOCKED") {
        await ctx.reply("Что мешает выполнению? (опиши причину)");
        const blockerCtx = await conversation.waitFor("message:text");
        await conversation.external(() => 
          prisma.answer.create({ 
            data: { checkInId: checkIn.id, value: `Блокер по задаче '${task.title}': ${blockerCtx.message!.text}` } 
          })
        );
      }
    }
  }

  // ИСПРАВЛЕНА ЛОГИКА ФИЛЬТРАЦИИ ВОПРОСОВ
  const questions = await conversation.external(() => 
    prisma.question.findMany({
      where: {
        checkInTime: { in: ["EVENING", "BOTH"] },
        OR: [
          { targetUserId: user.id },
          { targetRoleId: { in: user.roles.map(r => r.id) } },
          { targetUserId: null, targetRoleId: null }
        ]
      }
    })
  )

for (const q of questions) {
    const answerVal = await askQuestionHelper(conversation, ctx, q);
    await conversation.external(() => 
      prisma.answer.create({ data: { checkInId: checkIn.id, questionId: q.id, value: answerVal } })
    );
  }
  await ctx.reply("Как в целом прошел день? ");
  const summaryCtx = await conversation.waitFor("message:text");
  await conversation.external(() => 
    prisma.answer.create({ data: { checkInId: checkIn.id, value: summaryCtx.message!.text } })
  );

  await ctx.reply("✨ Итоги дня записаны. Отдыхай!");

    // === НОВОЕ: ПОДСЧЕТ СЕРИИ БЕЗ ПРОПУСКОВ ===
  const now = new Date();
  const todayStr = formatInTimeZone(now, user.timezone, "yyyy-MM-dd");
  const startOfToday = fromZonedTime(`${todayStr} 00:00:00`, user.timezone);

  // Считаем серию только при первом вечернем чек-ине за сегодня (если заполнил 2 раза, считаем только первый)
  const todayEveningCount = await conversation.external(() => 
    prisma.checkIn.count({
      where: { userId: user.id, type: "EVENING", createdAt: { gte: startOfToday } }
    })
  );

  if (todayEveningCount === 1) {
    let prevDate = now;
    let prevDayFound = false;

    // Ищем предыдущий рабочий день (максимум на 14 дней назад, защита от бесконечного цикла)
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

      // Проверяем, был ли вечерний чекин в предыдущий рабочий день
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
        await ctx.reply(`🔥 ${newStreak} дней подряд без пропусков!`);
      }
    } else {
      // Если предыдущих рабочих дней не найдено (например, график только 1 день в неделю или только устроился)
      await conversation.external(() => 
        prisma.user.update({ where: { id: user.id }, data: { streakCount: 1 } })
      );
    }
  }

}

