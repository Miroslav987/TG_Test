import { Bot, InlineKeyboard } from "grammy";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { startOfDay } from "date-fns";
import { MyContext, prisma, getMainMenuKeyboard } from "./index"; // <-- Заменили импорт

function timeToMinutes(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function startScheduler(bot: Bot<MyContext>) {
  console.log("⏱ Тикер-планировщик запущен...");

  setInterval(async () => {
    try {
      const users = await prisma.user.findMany({ 
        where: { isActive: true, telegramId: { not: null } },
        include: { roles: true }
      });
      const now = new Date();
      
      const scheduledQuestions = await prisma.question.findMany({
        where: { scheduleType: { in: ["EXACT_TIME", "RECURRING"] } }
      });

      for (const user of users) {
        const currentDay = parseInt(formatInTimeZone(now, user.timezone, 'i')); 
        const currentTimeStr = formatInTimeZone(now, user.timezone, 'HH:mm');
        const todayStart = startOfDay(now);
        const todayStr = formatInTimeZone(now, user.timezone, 'yyyy-MM-dd');

        const userStartOfToday = fromZonedTime(`${todayStr} 00:00:00`, user.timezone);

          // ==========================================
        // 0. АКТУАЛИЗАЦИЯ ОТСУТСТВИЙ
        // ==========================================
        const activeAbsences = await prisma.absence.findMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
            type: { in: ["FULL_DAY", "RANGE"] }
          }
        });

        for (const abs of activeAbsences) {
          const startStr = formatInTimeZone(abs.startDate, user.timezone, 'yyyy-MM-dd');
          const endStr = formatInTimeZone(abs.endDate, user.timezone, 'yyyy-MM-dd');

          // Если сегодня попадает в диапазон отсутствия
          if (todayStr >= startStr && todayStr <= endStr) {
            const lastReconfStr = abs.lastReconfirmedAt ? formatInTimeZone(abs.lastReconfirmedAt, user.timezone, 'yyyy-MM-dd') : null;

            // Если сегодня еще не подтверждали
            if (lastReconfStr !== todayStr) {
              // Сразу обновляем дату, чтобы тикер не спамил каждую минуту
              await prisma.absence.update({ where: { id: abs.id }, data: { lastReconfirmedAt: now } });
              
              const dateText = startStr === endStr ? startStr : `${startStr} – ${endStr}`;
              const kb = new InlineKeyboard()
                .text("✅ Да, актуально", `absence_yes_${abs.id}`).row()
                .text("❌ Уже не актуально", `absence_no_${abs.id}`);

              await bot.api.sendMessage(
                Number(user.telegramId), 
                `Ты указывал(а), что не будешь работать ${dateText} — это всё ещё актуально?`, 
                { reply_markup: kb }
              );
            }
          }
        }

        // ==========================================
        // ПРОПУСКАЕМ ОСТАЛЬНОЕ, ЕСЛИ ПОЛЬЗОВАТЕЛЬ НА ПАУЗЕ
        // ==========================================
        if (user.pausedUntil && user.pausedUntil > now) continue;


        // ==========================================
        // 1. СТАНДАРТНЫЕ УТРЕННИЕ И ВЕЧЕРНИЕ ЧЕК-ИНЫ
        // ==========================================
        if (user.workDays.includes(currentDay)) {
          
          // УТРЕННЯЯ РАССЫЛКА (с управляемым флагом)
          // const ENABLE_MORNING = process.env.ENABLE_MORNING_CHECKIN === "true";
          
          // if (ENABLE_MORNING && currentTimeStr >= user.workStart && (!user.lastMorningCheck || user.lastMorningCheck < todayStart)) {
          //   await prisma.user.update({ where: { id: user.id }, data: { lastMorningCheck: now } });
          //   await bot.api.sendMessage(Number(user.telegramId), "🌅 Доброе утро! Время планировать рабочий день.", { reply_markup: getMainMenuKeyboard(user.isAdmin) });
          //   await bot.api.sendMessage(Number(user.telegramId), "👇 Нажми кнопку ниже, чтобы начать чек-ин:", { reply_markup: { inline_keyboard: [[{ text: "📝 Начать план", callback_data: "start_morning" }]] } });
          // }

          // // ВЕЧЕРНЯЯ РАССЫЛКА (только если нет выполненных задач)
          // if (currentTimeStr >= user.workEnd && (!user.lastEveningCheck || user.lastEveningCheck < todayStart)) {
          //   // Флаг обновляем сразу, чтобы перезапуск бота не привел к повторной рассылке
          //   await prisma.user.update({ where: { id: user.id }, data: { lastEveningCheck: now } });
            
          //   // const completedTasksToday = await prisma.task.count({
          //   //   where: { assigneeId: user.id, status: "DONE", updatedAt: { gte: userStartOfToday } }
          //   // });
          //               const completedTasksToday = await prisma.task.count({
          //     where: { 
          //       status: "DONE", 
          //       updatedAt: { gte: userStartOfToday },
          //       OR: [
          //         { assigneeId: user.id },
          //         { assigneeId: null, createdById: user.id } // <-- ИЗМЕНЕНО
          //       ]
          //     }
          //   });

          //   if (completedTasksToday === 0) {
          //     await bot.api.sendMessage(Number(user.telegramId), "🌆 Рабочий день подошёл к концу. Подведем итоги?", { reply_markup: getMainMenuKeyboard(user.isAdmin) });
          //     await bot.api.sendMessage(Number(user.telegramId), "👇 Нажми кнопку ниже, чтобы заполнить отчёт:", { reply_markup: { inline_keyboard: [[{ text: "📊 Заполнить отчет", callback_data: "start_evening" }]] } });
          //   }
          // }

          // ВЕЧЕРНЕЕ НАПОМИНАНИЕ
          const currentMins = timeToMinutes(currentTimeStr);
          const endMins = timeToMinutes(user.workEnd);
          if (currentMins >= endMins + 60 && (!user.lastEveningReminder || user.lastEveningReminder < todayStart)) {
            // Флаг обновляем сразу
            await prisma.user.update({ where: { id: user.id }, data: { lastEveningReminder: now } });

            const checkInExists = await prisma.checkIn.findFirst({ where: { userId: user.id, type: "EVENING", createdAt: { gte: todayStart } } });
            const completedTasksToday = await prisma.task.count({
              where: { assigneeId: user.id, status: "DONE", updatedAt: { gte: userStartOfToday } }
            });

            // Напоминаем только если отчёта нет И задач выполненных нет
            if (!checkInExists && completedTasksToday === 0) {
              await bot.api.sendMessage(Number(user.telegramId), "🔔 Напоминание: ты забыл заполнить вечерний отчёт! Пожалуйста, удели минутку.", 
                { reply_markup: { inline_keyboard: [[{ text: "📊 Заполнить отчет", callback_data: "start_evening" }]] } });
            }
          }
        }

        // ==========================================
        // 2. КАСТОМНЫЕ ВОПРОСЫ (ПЕРВИЧНАЯ ОТПРАВКА)
        // ==========================================
        for (const q of scheduledQuestions) {
          const appliesToUser = 
            q.targetUserId === user.id || 
            (q.targetRoleId && user.roles.some(r => r.id === q.targetRoleId)) ||
            (!q.targetUserId && !q.targetRoleId);

          if (!appliesToUser) continue;

          let shouldAsk = false;

          if (q.scheduleType === "EXACT_TIME" && q.exactTime) {
            if (now >= q.exactTime) shouldAsk = true;
          } 
          else if (q.scheduleType === "RECURRING") {
            if (q.recurrenceInterval === "DAILY" && q.recurrenceTime === currentTimeStr) {
              shouldAsk = true;
            } else if (q.recurrenceInterval === "WEEKLY" && q.recurrenceDay === currentDay && q.recurrenceTime === currentTimeStr) {
              shouldAsk = true;
            }
          }

          if (shouldAsk) {
            const recent = q.scheduleType === "RECURRING" ? new Date(now.getTime() - 12 * 60 * 60 * 1000) : new Date(0);
            const deliveryCount = await prisma.questionDelivery.count({
              where: { questionId: q.id, userId: user.id, createdAt: { gte: recent } }
            });

            if (deliveryCount === 0) {
              await prisma.questionDelivery.create({ data: { questionId: q.id, userId: user.id } });
              
              const kb = new InlineKeyboard().text("📝 Ответить", `ans_custom_${q.id}`);
              await bot.api.sendMessage(
                Number(user.telegramId), 
                `🔔 *Новый опрос:*\n\n${q.text}`, 
                { reply_markup: kb, parse_mode: "Markdown" }
              );
            }
          }
        }

        // ==========================================
        // 3. НАПОМИНАНИЯ О НЕОТВЕЧЕННЫХ ВОПРОСАХ
        // ==========================================
        for (const q of scheduledQuestions) {
          if (!q.remindUntilAnswered) continue;

          const appliesToUser = 
            q.targetUserId === user.id || 
            (q.targetRoleId && user.roles.some(r => r.id === q.targetRoleId)) ||
            (!q.targetUserId && !q.targetRoleId);

          if (!appliesToUser) continue;

          const lastDelivery = await prisma.questionDelivery.findFirst({
            where: { questionId: q.id, userId: user.id },
            orderBy: { createdAt: 'desc' }
          });

          if (lastDelivery) {
            const hasAnswer = await prisma.answer.findFirst({
              where: {
                userId: user.id,
                questionId: q.id,
                createdAt: { gte: lastDelivery.createdAt }
              }
            });

            if (!hasAnswer) {
              const baseTime = lastDelivery.lastReminderAt || lastDelivery.createdAt;
              const ageMs = now.getTime() - baseTime.getTime();

              if (ageMs >= 3 * 60 * 60 * 1000) { // 3 часа = 10 800 000 мс
                await prisma.questionDelivery.update({
                  where: { id: lastDelivery.id },
                  data: { lastReminderAt: now }
                });

                const kb = new InlineKeyboard().text("📝 Ответить", `ans_custom_${q.id}`);
                await bot.api.sendMessage(
                  Number(user.telegramId), 
                  `🔔 *Напоминание! Вы не ответили на опрос:*\n\n${q.text}`, 
                  { reply_markup: kb, parse_mode: "Markdown" }
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Ошибка в планировщике:", error);
    }
  }, 60 * 1000);
}