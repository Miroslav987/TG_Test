"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const name = formData.get("name") as string;
  await prisma.project.create({ data: { name } });
  revalidatePath("/projects");
}

export async function addUserToProject(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  const userId = formData.get("userId") as string;
  
  if (projectId && userId) {
    await prisma.project.update({
      where: { id: projectId },
      data: { users: { connect: { id: userId } } }
    });
    revalidatePath("/projects");
  }
}

export async function createTask(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  const title = formData.get("title") as string;
  const assigneeId = formData.get("assigneeId") as string;
  const deadlineStr = formData.get("deadline") as string;

  await prisma.task.create({
    data: {
      title,
      projectId,
      assigneeId: assigneeId || null,
      deadline: deadlineStr ? new Date(deadlineStr) : null,
    }
  });
  revalidatePath("/projects");
}

export async function toggleProjectStatus(formData: FormData) {
  const id = formData.get("projectId") as string;
  const isActive = formData.get("isActive") === "true";
  await prisma.project.update({ where: { id }, data: { isActive: !isActive } });
  revalidatePath("/projects");
}

export async function deleteProject(formData: FormData) {
  const id = formData.get("projectId") as string;
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
}