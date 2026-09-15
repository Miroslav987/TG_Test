import { Bot } from "grammy";
import { formatInTimeZone } from "date-fns-tz";
import { startOfDay } from "date-fns";
import { MyContext, prisma } from "./index";

function timeToMinutes(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function startScheduler(bot: Bot<MyContext>) {
  console.log("⏱ Тикер-планировщик запущен...");

  setInterval(async () => {
    try {
      const users = await prisma.user.findMany({ where: { isActive: true, telegramId: { not: null } } });
      const now = new Date();

      for (const user of users) {
        const currentDay = parseInt(formatInTimeZone(now, user.timezone, 'i')); 
        const currentTimeStr = formatInTimeZone(now, user.timezone, 'HH:mm');
        const todayStart = startOfDay(now);

        if (!user.workDays.includes(currentDay)) continue;

        // 1. УТРЕННИЙ ЧЕК-ИН
        if (currentTimeStr >= user.workStart && (!user.lastMorningCheck || user.lastMorningCheck < todayStart)) {
          await prisma.user.update({ where: { id: user.id }, data: { lastMorningCheck: now } });
          await bot.api.sendMessage(
            Number(user.telegramId), 
            "🌅 Доброе утро! Время планировать рабочий день.", 
            { reply_markup: { inline_keyboard: [[{ text: "📝 Начать план", callback_data: "start_morning" }]] } }
          );
        }

        // 2. ВЕЧЕРНИЙ ЧЕК-ИН
        if (currentTimeStr >= user.workEnd && (!user.lastEveningCheck || user.lastEveningCheck < todayStart)) {
          await prisma.user.update({ where: { id: user.id }, data: { lastEveningCheck: now } });
          await bot.api.sendMessage(
            Number(user.telegramId), 
            "🌆 Рабочий день подошёл к концу. Подведем итоги?", 
            { reply_markup: { inline_keyboard: [[{ text: "📊 Заполнить отчет", callback_data: "start_evening" }]] } }
          );
        }

        // 3. НАПОМИНАНИЕ (через 60 минут после workEnd)
        const currentMins = timeToMinutes(currentTimeStr);
        const endMins = timeToMinutes(user.workEnd);
        
        if (currentMins >= endMins + 60 && (!user.lastEveningReminder || user.lastEveningReminder < todayStart)) {
          // Проверяем, реально ли он не заполнил отчёт
          const checkInExists = await prisma.checkIn.findFirst({
            where: { userId: user.id, type: "EVENING", createdAt: { gte: todayStart } }
          });

          if (!checkInExists) {
            // Ставим флаг, чтобы не спамить
            await prisma.user.update({ where: { id: user.id }, data: { lastEveningReminder: now } });
            await bot.api.sendMessage(
              Number(user.telegramId), 
              "🔔 Напоминание: ты забыл заполнить вечерний отчёт! Пожалуйста, удели минутку.", 
              { reply_markup: { inline_keyboard: [[{ text: "📊 Заполнить отчет", callback_data: "start_evening" }]] } }
            );
          }
        }
      }
    } catch (error) {
      console.error("Ошибка в планировщике:", error);
    }
  }, 60 * 1000);
}