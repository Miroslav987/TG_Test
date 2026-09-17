"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  const inviteToken = Math.random().toString(36).substring(2, 10);
  
  // Собираем массив ID ролей
  const roleIds = formData.getAll("roleIds").map(id => String(id));

  await prisma.user.create({
    data: { 
      name, 
      inviteToken,
      timezone: "Asia/Bishkek",
      roles: { connect: roleIds.map(id => ({ id })) } // Подключаем выбранные роли
    }
  });
  revalidatePath("/");
}

export async function updateUser(formData: FormData) {
  const id = formData.get("userId") as string;
  const name = formData.get("name") as string;
  const timezone = formData.get("timezone") as string;
  const workStart = formData.get("workStart") as string;
  const workEnd = formData.get("workEnd") as string;
  const workDays = formData.getAll("workDays").map(Number);
  
  const roleIds = formData.getAll("roleIds").map(id => String(id));

  await prisma.user.update({
    where: { id },
    data: { 
      name, 
      timezone, 
      workStart, 
      workEnd, 
      workDays,
      roles: { set: roleIds.map(id => ({ id })) } // Перезаписываем список ролей
    }
  });
  revalidatePath("/");
}

export async function toggleUserStatus(formData: FormData) {
  const id = formData.get("userId") as string;
  const isActive = formData.get("isActive") === "true";

  await prisma.user.update({
    where: { id },
    data: { isActive: !isActive }
  });
  revalidatePath("/");
}

export async function deleteUser(formData: FormData) {
  const id = formData.get("userId") as string;
  try {
    // Перепроверяем на сервере, что истории реально нет (защита от гонки/хаков)
    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { checkIns: true, tasks: true } } }
    });

    if (!user || user._count.checkIns > 0 || user._count.tasks > 0) return;

    await prisma.user.delete({ where: { id } });
  } catch (error) {
    console.error("Ошибка удаления пользователя:", error);
  }
  revalidatePath("/");
}

export async function toggleAdmin(formData: FormData) {
  const id = formData.get("userId") as string;
  const isAdmin = formData.get("isAdmin") === "true";

  await prisma.user.update({
    where: { id },
    data: { isAdmin: !isAdmin }
  });
  revalidatePath("/");
}