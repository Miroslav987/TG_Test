"use server";
import { prisma, generateProjectReport, generateEmployeeReport } from "@standup/shared";
import { revalidatePath } from "next/cache";
import { startOfWeek, startOfMonth, startOfDay, endOfDay } from "date-fns";

function parseDates(formData: FormData) {
  const period = formData.get("period") as string || "week";
  const now = new Date();
  let startDate: Date, endDate: Date;

  if (period === "week") {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
    endDate = now;
  } else if (period === "month") {
    startDate = startOfMonth(now);
    endDate = now;
  } else {
    // custom
    const fromStr = formData.get("from") as string;
    const toStr = formData.get("to") as string;
    startDate = fromStr ? startOfDay(new Date(fromStr)) : startOfMonth(now);
    endDate = toStr ? endOfDay(new Date(toStr)) : endOfDay(now);
  }
  return { startDate, endDate };
}

export async function generateAndSaveReport(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  if (!projectId) return;

  const { startDate, endDate } = parseDates(formData);
  const content = await generateProjectReport(projectId, startDate, endDate);

  await prisma.report.create({ data: { projectId, content } });
  revalidatePath("/reports");
}

export async function generateAndSaveEmployeeReport(formData: FormData) {
  const userId = formData.get("userId") as string;
  if (!userId) return;

  const { startDate, endDate } = parseDates(formData);
  const content = await generateEmployeeReport(userId, startDate, endDate);

  await prisma.report.create({ data: { userId, content } });
  revalidatePath("/reports");
}