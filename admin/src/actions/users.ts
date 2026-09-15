"use server";
import { PrismaClient } from "@standup/shared";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  // Генерируем уникальный токен из 8 символов
  const inviteToken = Math.random().toString(36).substring(2, 10);

  await prisma.user.create({
    data: { 
      name, 
      inviteToken,
      timezone: "Asia/Bishkek", // Твой часовой пояс по умолчанию
    }
  });

  revalidatePath("/users");
}