import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";

export async function newTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  // Подтягиваем юзера и его активные проекты
  const user = await conversation.external(() => 
    prisma.user.findUnique({ 
      where: { telegramId: ctx.from?.id }, 
      include: { projects: { where: { isActive: true } } } 
    })
  );
  
  if (!user) return;

  if (user.projects.length === 0) {
    await ctx.reply("У тебя пока нет активных проектов, обратись к администратору.");
    return;
  }

  // Выбор проекта
  const projectKb = new InlineKeyboard();
  user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
  
  await ctx.reply("Для какого проекта задача?", { reply_markup: projectKb });
  const projCtx = await conversation.waitForCallbackQuery(/proj_.+/);
  const projectId = projCtx.match.split("_")[1];
  await projCtx.answerCallbackQuery();

  const selectedProject = user.projects.find(p => p.id === projectId);

  // Ввод текста задачи
  await ctx.reply("Что нужно сделать?");
  const taskCtx = await conversation.waitFor("message:text");
  const title = taskCtx.message!.text;

  // Создание в БД
  await conversation.external(() => 
    prisma.task.create({
      data: {
        title,
        projectId,
        assigneeId: user.id,
        status: "TODO"
      }
    })
  );

  // Подтверждение
  await ctx.reply(`✅ Задача «${title}» добавлена в проект «${selectedProject?.name}»`);
}