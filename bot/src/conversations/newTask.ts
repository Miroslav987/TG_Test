import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext, prisma } from "../index";

export async function newTaskConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
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

  let projectId: string | undefined = undefined;
  let selectedProject: any = undefined;

  // Цикл выбора проекта
  while (!projectId) {
    const projectKb = new InlineKeyboard();
    user.projects.forEach(p => projectKb.text(p.name, `proj_${p.id}`).row());
    
    await ctx.reply("Для какого проекта задача?", { reply_markup: projectKb });
    
    // Ждём либо клика по кнопке, либо ввода текста
    const projCtx = await conversation.waitFor(["callback_query:data", "message:text"]);

    if (projCtx.has("callback_query:data")) {
      const data = projCtx.callbackQuery.data;
      if (data.startsWith("proj_")) {
        projectId = data.replace("proj_", "");
        selectedProject = user.projects.find(p => p.id === projectId);
        await projCtx.answerCallbackQuery();
      }
    } else if (projCtx.has("message:text")) {
      const text = projCtx.message.text.toLowerCase().trim();
      // Ищем частичное или полное совпадение
      const matches = user.projects.filter(p => p.name.toLowerCase().includes(text));
      
      if (matches.length === 1) {
        projectId = matches[0].id;
        selectedProject = matches[0];
      } else {
        await ctx.reply("Не нашёл проект с таким названием (или нашлось несколько). Пожалуйста, выбери кнопкой:");
      }
    }
  }

  await ctx.reply("Что нужно сделать?");
  let title = "";
  
  // Цикл ввода текста (защита от пустых/нетекстовых сообщений)
  while (!title) {
    const taskCtx = await conversation.waitFor("message:text");
    if (taskCtx.message?.text?.trim()) {
      title = taskCtx.message.text.trim();
    } else {
      await ctx.reply("Пожалуйста, напиши текст задачи.");
    }
  }

  await conversation.external(() => 
    prisma.task.create({
      data: {
        title,
        projectId: projectId!,
        assigneeId: user.id,
        status: "TODO"
      }
    })
  );

  await ctx.reply(`✅ Задача «${title}» добавлена в проект «${selectedProject?.name}»`);
}