import { Bot } from "grammy";
import { prisma, MyContext } from "./index";
import { format, formatInTimeZone } from "date-fns-tz";
import { startOfDay } from "date-fns";

export function startScheduler(bot: Bot<MyContext>) {
  setInterval(async () => {
    const users = await prisma.user.findMany({ where: { isActive: true, telegramId: { not: null } } });
    
    for (const user of users) {
      // 1. Проверяем день недели и время в зоне юзера
      const nowInTz = new Date();
      const currentDay = parseInt(formatInTimeZone(nowInTz, user.timezone, 'i')); // 1-7
      const currentTime = formatInTimeZone(nowInTz, user.timezone, 'HH:mm');
      const todayStart = startOfDay(nowInTz);

      if (!user.workDays.includes(currentDay)) continue;

      // 2. Утренний чекин
      if (currentTime >= user.workStart && (!user.lastMorningCheck || user.lastMorningCheck < todayStart)) {
        await prisma.user.update({ where: { id: user.id }, data: { lastMorningCheck: new Date() } });
        await bot.api.sendMessage(Number(user.telegramId), "🌅 Доброе утро! Пора планировать день.");
        // Запускаем разговор у юзера
        await bot.api.sendMessage(Number(user.telegramId), "/morning", { 
           reply_markup: { inline_keyboard: [[{ text: "Начать чекин", callback_data: "start_morning" }]] }
        });
      }

      // 3. Вечерний чекин (аналогично)
      if (currentTime >= user.workEnd && (!user.lastEveningCheck || user.lastEveningCheck < todayStart)) {
        await prisma.user.update({ where: { id: user.id }, data: { lastEveningCheck: new Date() } });
        await bot.api.sendMessage(Number(user.telegramId), "🌆 Рабочий день подошёл к концу. Подведем итоги?");
        await bot.api.sendMessage(Number(user.telegramId), "/evening", { 
           reply_markup: { inline_keyboard: [[{ text: "Заполнить отчет", callback_data: "start_evening" }]] }
        });
      }
    }
  }, 60 * 1000); // Раз в минуту
}