import { Bot, InlineKeyboard } from "grammy";
import { formatInTimeZone } from "date-fns-tz";
import { MyContext, prisma } from "./index";

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
      }
    } catch (error) {
      console.error("Ошибка в планировщике:", error);
    }
  }, 60 * 1000);
}