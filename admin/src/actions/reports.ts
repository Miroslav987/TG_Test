"use server";
import { prisma, generateProjectReport } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function generateAndSaveReport(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  if (!projectId) return;

  const content = await generateProjectReport(projectId);

  await prisma.report.create({
    data: { projectId, content }
  });

  revalidatePath("/reports");
}