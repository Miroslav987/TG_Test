import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./index";

export async function generateProjectReport(projectId: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { 
      users: true, // Нужно для получения их чек-инов
      tasks: { include: { assignee: { select: { name: true, roles: { select: { name: true } } } } } }
    }
  });

  if (!project) throw new Error("Проект не найден");

  // Получаем сегодняшние чек-ины участников проекта
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Начало сегодняшнего дня

  const checkIns = await prisma.checkIn.findMany({
    where: {
      userId: { in: project.users.map(u => u.id) },
      createdAt: { gte: today }
    },
    include: {
      user: { select: { name: true } },
      answers: { include: { question: { select: { text: true } } } }
    }
  });

  // Безопасные данные для промпта
  const safeTasks = project.tasks.map(t => ({
    title: t.title,
    status: t.status,
    assignee: t.assignee?.name || "Не назначен",
    role: t.assignee?.roles?.map(r => r.name).join(", ") || "Нет роли"
  }));

  const safeCheckIns = checkIns.map(c => ({
    user: c.user.name,
    type: c.type,
    answers: c.answers.map(a => ({
      question: a.question?.text || "Свободный ответ / Планы",
      answer: a.value
    }))
  }));

  const prompt = `
    Ты ассистент IT-команды. Составь четкий и лаконичный отчет по проекту "${project.name}" на основе текущих задач и сегодняшних чек-инов сотрудников.
    
    📋 Список задач в проекте:
    ${JSON.stringify(safeTasks, null, 2)}

    💬 Данные из сегодняшних чек-инов (планы, итоги дня, ответы на вопросы, блокеры):
    ${JSON.stringify(safeCheckIns, null, 2)}
    
    Сделай структуру:
    1. 🎯 Что сделано (задачи в статусе DONE)
    2. 🔄 В работе (задачи IN_PROGRESS)
    3. ⛔ Заблокировано (задачи BLOCKED)
    4. 👥 Кто чем занимался (краткая сводка по сотрудникам на основе тасков и чек-инов)
    5. 💬 Из чек-инов (важные детали из текстовых ответов, блокеры, проблемы и инсайты)
    
    Пиши профессионально, используй эмодзи для списков. Без воды. Не придумывай того, чего нет в JSON.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Ошибка Gemini API:", error);
    return "Не удалось сгенерировать отчет из-за ошибки сервиса AI.";
  }
}