import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma } from "../index";
import { MENU_TRIGGERS } from "../index";

export async function newProjectConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("Как назвать проект?");
  
  const nameCtx = await conversation.waitFor("message:text");

  if (nameCtx.message?.text && MENU_TRIGGERS.includes(nameCtx.message.text)) {
    await ctx.reply("Отменил текущее действие. Нажми на кнопку ещё раз, чтобы начать заново 👆");
    return;
  }

  const name = nameCtx.message!.text.trim();
  if (!name) {
    await ctx.reply("Название не может быть пустым. Отмена.");
    return;
  }

  const project = await conversation.external(() => 
    prisma.project.create({
      data: { name, tasksRequired: true, users: { connect: { id: user.id } } }
    })
  );

  // ДОБАВЛЕНО: Инлайн-кнопка для быстрого удаления
  await ctx.reply(`✅ Проект «${name}» создан, ты в нём участник.`, {
    reply_markup: {
      inline_keyboard: [[{ text: "🗑 Удалить проект", callback_data: `del_project_${project.id}` }]]
    }
  });
}