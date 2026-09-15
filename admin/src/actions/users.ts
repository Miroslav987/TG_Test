"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  const roleId = formData.get("roleId") as string;
  const inviteToken = Math.random().toString(36).substring(2, 10);

  await prisma.user.create({
    data: { 
      name, 
      inviteToken,
      roleId: roleId || null,
      timezone: "Asia/Bishkek", 
    }
  });

  revalidatePath("/");
}

// НОВЫЙ ЭКШН
export async function updateUserSchedule(formData: FormData) {
  const userId = formData.get("userId") as string;
  const timezone = formData.get("timezone") as string;
  const workStart = formData.get("workStart") as string;
  const workEnd = formData.get("workEnd") as string;
  
  // Собираем массив выбранных чекбоксов (1-7)
  const workDays = formData.getAll("workDays").map(Number);

  await prisma.user.update({
    where: { id: userId },
    data: { timezone, workStart, workEnd, workDays }
  });

  revalidatePath("/");
}