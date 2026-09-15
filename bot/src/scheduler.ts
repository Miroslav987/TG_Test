import { Bot } from "grammy";
import { formatInTimeZone } from "date-fns-tz";
import { startOfDay } from "date-fns";
import { MyContext, prisma } from "./index";

export function startScheduler(bot: Bot<MyContext>) {
  setInterval(async () => {
    const users = await prisma.user.findMany({ where: { isActive: true, telegramId: { not: null } } });
    const nowInTz = new Date();

    for (const user of users) {
      const currentDay = parseInt(formatInTimeZone(nowInTz, user.timezone, 'i')); 
      const currentTime = formatInTimeZone(nowInTz, user.timezone, 'HH:mm');
      const todayStart = startOfDay(nowInTz);

      if (!user.workDays.includes(currentDay)) continue;

      if (currentTime >= user.workStart && (!user.lastMorningCheck || user.lastMorningCheck < todayStart)) {
        await prisma.user.update({ where: { id: user.id }, data: { lastMorningCheck: new Date() } });
        
        // 1. Убрано сообщение "/morning", оставлен только призыв с кнопкой
        await bot.api.sendMessage(
          Number(user.telegramId), 
          "🌅 Доброе утро! Время планировать рабочий день.", 
          { reply_markup: { inline_keyboard: [[{ text: "📝 Начать план", callback_data: "start_morning" }]] } }
        );
      }

      if (currentTime >= user.workEnd && (!user.lastEveningCheck || user.lastEveningCheck < todayStart)) {
        await prisma.user.update({ where: { id: user.id }, data: { lastEveningCheck: new Date() } });
        
        // 1. Аналогично для вечера
        await bot.api.sendMessage(
          Number(user.telegramId), 
          "🌆 Рабочий день подошёл к концу. Подведем итоги?", 
          { reply_markup: { inline_keyboard: [[{ text: "📊 Заполнить отчет", callback_data: "start_evening" }]] } }
        );
      }
    }
  }, 60 * 1000);
}