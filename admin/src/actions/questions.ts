"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

// Функция парсинга повторяется, выносим общую логику
function extractQuestionData(formData: FormData) {
  const text = formData.get("text") as string;
  const type = formData.get("type") as any;
  const checkInTime = formData.get("checkInTime") as any;
  const isRequired = formData.get("isRequired") === "on";

  let options: string[] = [];
  if (type === "SELECT") {
    const optsString = formData.get("options") as string;
    options = optsString ? optsString.split(",").map(s => s.trim()).filter(Boolean) : [];
  }

  const targetType = formData.get("targetType") as string;
  const targetRoleId = targetType === "ROLE" ? formData.get("targetRoleId") as string : null;
  const targetUserId = targetType === "USER" ? formData.get("targetUserId") as string : null;

  return { text, type, checkInTime, isRequired, options, targetRoleId, targetUserId };
}

export async function createQuestion(formData: FormData) {
  await prisma.question.create({ data: extractQuestionData(formData) });
  revalidatePath("/questions");
}

export async function updateQuestion(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.question.update({
    where: { id },
    data: extractQuestionData(formData)
  });
  revalidatePath("/questions");
}

export async function deleteQuestion(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.question.delete({ where: { id } });
  revalidatePath("/questions");
}