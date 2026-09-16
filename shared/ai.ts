import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./index";

export async function generateProjectReport(projectId: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { 
      tasks: { include: { assignee: { select: { name: true, role: { select: { name: true } } } } } }
    }
  });

  if (!project) throw new Error("Проект не найден");

  const safeData = project.tasks.map(t => ({
    title: t.title,
    status: t.status,
    assignee: t.assignee?.name || "Не назначен",
    role: t.assignee?.role?.name || "Нет роли"
  }));

  const prompt = `
    Ты ассистент IT-команды. Составь четкий и лаконичный отчет по проекту "${project.name}" на основе текущих задач.
    Вот список задач: ${JSON.stringify(safeData, null, 2)}
    Сделай структуру:
    1. 🎯 Что сделано (задачи в статусе DONE)
    2. 🔄 В работе (задачи IN_PROGRESS)
    3. ⛔ Заблокировано (задачи BLOCKED)
    4. 👥 Кто чем занимался (краткая сводка по сотрудникам)
    Пиши профессионально, используй эмодзи для списков. Без воды.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Ошибка Gemini API:", error);
    return "Не удалось сгенерировать отчет из-за ошибки сервиса AI.";
  }
}