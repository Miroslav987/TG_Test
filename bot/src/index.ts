import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), "../.env") });

import { Bot, session, Context } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { startScheduler } from "./scheduler";
import { PrismaClient } from "@standup/shared";
import { morningConversation } from "./conversations/morning";
import { eveningConversation } from "./conversations/evening";

export type MyContext = Context & { session: any }; 
export const prisma = new PrismaClient();
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Регистрируем сценарии (FSM)
bot.use(createConversation(morningConversation, "morning"));
bot.use(createConversation(eveningConversation, "evening"));

// Команда старта (привязка аккаунта)
bot.command("start", async (ctx) => {
  const token = ctx.match;
  if (!token) return ctx.reply("Привет! Для использования бота нужна ссылка-приглашение.");

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) return ctx.reply("Неверный или устаревший токен.");

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: ctx.from?.id, inviteToken: null },
  });

  await ctx.reply(`Отлично, ${user.name}! Твой Telegram привязан. Я буду писать тебе по расписанию.`);
});

// Запуск бота и тикера
bot.start({
  onStart: () => {
    console.log("Bot is running!");
    startScheduler(bot); // Запускаем фоновый планировщик
  },
});