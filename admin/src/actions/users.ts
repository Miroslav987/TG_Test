"use server";
// 3. Импортируем готовый инстанс БД
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  const inviteToken = Math.random().toString(36).substring(2, 10);

  await prisma.user.create({
    data: { 
      name, 
      inviteToken,
      timezone: "Asia/Bishkek", // Дефолтная таймзона
    }
  });

  revalidatePath("/users");
}