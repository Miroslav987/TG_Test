"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createQuestion(formData: FormData) {
  const text = formData.get("text") as string;
  const type = formData.get("type") as any; // TEXT, NUMBER, TIME, YES_NO, SELECT
  const checkInTime = formData.get("checkInTime") as any; // MORNING, EVENING, BOTH
  const isRequired = formData.get("isRequired") === "on";

  // Обработка вариантов для типа SELECT
  let options: string[] = [];
  if (type === "SELECT") {
    const optsString = formData.get("options") as string;
    options = optsString ? optsString.split(",").map(s => s.trim()).filter(Boolean) : [];
  }

  const targetType = formData.get("targetType") as string;
  const targetRoleId = targetType === "ROLE" ? formData.get("targetRoleId") as string : null;
  const targetUserId = targetType === "USER" ? formData.get("targetUserId") as string : null;

  await prisma.question.create({
    data: {
      text,
      type,
      checkInTime,
      isRequired,
      options,
      targetRoleId: targetRoleId || null,
      targetUserId: targetUserId || null,
    }
  });

  revalidatePath("/questions");
}