"use server";
import { prisma, generateProjectReport, generateEmployeeReport } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function generateAndSaveReport(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  if (!projectId) return;

  const content = await generateProjectReport(projectId);

  await prisma.report.create({
    data: { projectId, content } // userId останется null
  });

  revalidatePath("/reports");
}

export async function generateAndSaveEmployeeReport(formData: FormData) {
  const userId = formData.get("userId") as string;
  const period = formData.get("period") as "today" | "week";
  if (!userId) return;

  const content = await generateEmployeeReport(userId, period);

  await prisma.report.create({
    data: { userId, content } // projectId останется null
  });

  revalidatePath("/reports");
}