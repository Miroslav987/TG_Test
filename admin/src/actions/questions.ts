"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

function extractQuestionData(formData: FormData) {
  const text = formData.get("text") as string;
  const type = formData.get("type") as any;
  const isRequired = formData.get("isRequired") === "on";
  const includeInReport = formData.get("includeInReport") === "on";

  // По умолчанию теперь RECURRING, убрали CHECK_IN
  const scheduleType = formData.get("scheduleType") as any || "RECURRING";
  
  const exactTimeStr = formData.get("exactTime") as string;
  const exactTime = (scheduleType === "EXACT_TIME" && exactTimeStr) ? new Date(exactTimeStr) : null;
  
  const recurrenceInterval = (scheduleType === "RECURRING" ? formData.get("recurrenceInterval") as any : null);
  const recurrenceTime = (scheduleType === "RECURRING" ? formData.get("recurrenceTime") as string : null);
  const recurrenceDay = (scheduleType === "RECURRING" && formData.get("recurrenceDay")) ? Number(formData.get("recurrenceDay")) : null;

  let options: string[] = [];
  if (type === "SELECT" || type === "MULTI_SELECT") {
    const optsString = formData.get("options") as string;
    options = optsString ? optsString.split(",").map(s => s.trim()).filter(Boolean) : [];
  }

  const targetType = formData.get("targetType") as string;
  const targetRoleId = targetType === "ROLE" ? formData.get("targetRoleId") as string : null;
  const targetUserId = targetType === "USER" ? formData.get("targetUserId") as string : null;

  return { 
    text, type, isRequired, includeInReport, options, targetRoleId, targetUserId,
    scheduleType, exactTime, recurrenceInterval, recurrenceTime, recurrenceDay
  };
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