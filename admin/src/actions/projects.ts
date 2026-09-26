"use server";
import { prisma, sendTelegramMessage } from "@standup/shared";
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
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { users: { connect: { id: userId } } }
    });
    
    // Получаем пользователя для отправки уведомления
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.telegramId) {
      await sendTelegramMessage(
        user.telegramId,
        `📂 Тебя добавили в проект «*${project.name}*»`
      );
    }
    
    revalidatePath("/projects");
  }
}

export async function createTask(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  const title = formData.get("title") as string;
  const assigneeId = formData.get("assigneeId") as string;
  const deadlineStr = formData.get("deadline") as string;

  const newTask = await prisma.task.create({
    data: {
      title,
      projectId,
      assigneeId: assigneeId || null,
      // В админке createdById оставляем null или можно вытянуть из JWT сессии, но пока не усложняем
      deadline: deadlineStr ? new Date(deadlineStr) : null,
    },
    include: { project: true, assignee: true }
  });

  if (newTask.assignee?.telegramId) {
    const deadlineText = newTask.deadline ? new Date(newTask.deadline).toLocaleDateString('ru-RU') : 'не указан';
    
    // ИЗМЕНЁН ФОРМАТ СООБЩЕНИЯ
    const notifyText = `📌 *Вам назначена новая задача*\n${newTask.title}\n\nОт: Администратор (через сайт)\nПроект: ${newTask.project?.name || "Без проекта"}\nСрок: ${deadlineText}`;
    
    try {
      await sendTelegramMessage(
        newTask.assignee.telegramId,
        notifyText,
        [[{ text: "✅ Принял", callback_data: `ack_task_${newTask.id}` }]]
      );
    } catch (e) {
      console.warn("Admin UI: Failed to send task notification", e);
    }
  }

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
  try {
    // Перепроверяем на сервере
    const project = await prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { tasks: true, reports: true } } }
    });

    if (!project || project._count.tasks > 0 || project._count.reports > 0) return;

    await prisma.project.delete({ where: { id } });
  } catch (error) {
    console.error("Ошибка удаления проекта:", error);
  }
  revalidatePath("/projects");
}

export async function removeUserFromProject(formData: FormData) {
  const projectId = formData.get("projectId") as string;
  const userId = formData.get("userId") as string;
  
  if (projectId && userId) {
    await prisma.project.update({
      where: { id: projectId },
      data: { users: { disconnect: { id: userId } } }
    });
    revalidatePath("/projects");
  }
}

export async function updateTask(formData: FormData) {
  const taskId = formData.get("taskId") as string;
  const title = formData.get("title") as string;
  const assigneeId = formData.get("assigneeId") as string;
  const deadlineStr = formData.get("deadline") as string;
  const status = formData.get("status") as any;

  if (taskId) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        assigneeId: assigneeId || null,
        deadline: deadlineStr ? new Date(deadlineStr) : null,
        status
      }
    });
    revalidatePath("/projects");
  }
}

export async function updateTaskStatus(formData: FormData) {
  const taskId = formData.get("taskId") as string;
  const status = formData.get("status") as any;
  if (taskId && status) {
    await prisma.task.update({ where: { id: taskId }, data: { status } });
    // "layout" обновит кэш на всех страницах (и /my-tasks, и /projects, и /users/[id]/tasks)
    revalidatePath("/", "layout");
  }
}

export async function deleteTask(formData: FormData) {
  const taskId = formData.get("taskId") as string;
  if (taskId) {
    await prisma.task.delete({ where: { id: taskId } });
    revalidatePath("/projects");
  }
}