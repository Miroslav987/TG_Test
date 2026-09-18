import { Conversation } from "@grammyjs/conversations";
import { MyContext, prisma } from "../index";

export async function newProjectConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  const user = await conversation.external(() => 
    prisma.user.findUnique({ where: { telegramId: ctx.from?.id } })
  );
  if (!user) return;

  await ctx.reply("Как назвать проект?");
  
  const nameCtx = await conversation.waitFor("message:text");
  const name = nameCtx.message!.text.trim();

  if (!name) {
    await ctx.reply("Название не может быть пустым. Отмена.");
    return;
  }

  await conversation.external(() => 
    prisma.project.create({
      data: {
        name,
        tasksRequired: true,
        users: { connect: { id: user.id } }
      }
    })
  );

  await ctx.reply(`✅ Проект «${name}» создан, ты в нём участник.`);
}