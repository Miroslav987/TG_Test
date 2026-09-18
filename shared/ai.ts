import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./index";

export async function generateProjectReport(projectId: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { 
      users: true,
      tasks: { include: { assignee: { select: { name: true, roles: { select: { name: true } } } } } }
    }
  });
  if (!project) throw new Error("Проект не найден");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userIds = project.users.map(u => u.id);
  const answers = await prisma.answer.findMany({
    where: {
      OR: [ { userId: { in: userIds } }, { checkIn: { userId: { in: userIds } } } ],
      createdAt: { gte: today },
      OR: [ { question: { includeInReport: true } }, { questionId: null } ]
    },
    include: {
      user: { select: { name: true } },
      checkIn: { include: { user: { select: { name: true } } } },
      question: { select: { text: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  const safeTasks = project.tasks.map(t => ({
    title: t.title,
    status: t.status,
    assignee: t.assignee?.name || "Не назначен",
    role: t.assignee?.roles?.map(r => r.name).join(", ") || "Нет роли"
  }));

  const safeAnswers = answers.map(a => ({
    user: a.user?.name || a.checkIn?.user?.name || "Неизвестно",
    time: a.createdAt.toISOString().split('T')[1].slice(0, 5),
    question: a.question?.text || "Свободный ответ / Итоги",
    answer: a.value
  }));

  // ДОБАВЛЕНО: Защита от пустых данных
  if (safeTasks.length === 0 && safeAnswers.length === 0) {
    return "⚠️ В проекте нет активных задач, а за выбранный период нет ни одного ответа — отчёт не сгенерирован, генерировать не из чего.";
  }

  const prompt = `
    Ты ассистент IT-команды. Составь четкий и лаконичный отчет по проекту "${project.name}".
    
    📋 Список задач в проекте:
    ${JSON.stringify(safeTasks, null, 2)}

    💬 Ответы сотрудников на опросники за сегодня (планы, итоги, блокеры):
    ${JSON.stringify(safeAnswers, null, 2)}
    
    Сделай структуру:
    1. 🎯 Что сделано (задачи в статусе DONE)
    2. 🔄 В работе (задачи IN_PROGRESS)
    3. ⛔ Заблокировано (задачи BLOCKED)
    4. 👥 Кто чем занимался (краткая сводка по сотрудникам на основе тасков и ответов)
    5. 💬 Важные детали из ответов (блокеры, инсайты)
    
    Пиши профессионально, используй эмодзи для списков. Без воды. Не придумывай того, чего нет в JSON.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return "Не удалось сгенерировать отчет из-за ошибки сервиса AI.";
  }
}

export async function generateEmployeeReport(userId: string, period: "today" | "week") {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tasks: { include: { project: { select: { name: true } } } } }
  });
  if (!user) throw new Error("Сотрудник не найден");

  const since = new Date();
  if (period === "week") {
    since.setDate(since.getDate() - 7);
  }
  since.setHours(0, 0, 0, 0);

  const answers = await prisma.answer.findMany({
    where: {
      OR: [ { userId: userId }, { checkIn: { userId: userId } } ],
      createdAt: { gte: since },
      OR: [ { question: { includeInReport: true } }, { questionId: null } ]
    },
    include: { question: { select: { text: true } } },
    orderBy: { createdAt: 'asc' }
  });

  const safeTasks = user.tasks.map(t => ({
    title: t.title,
    status: t.status,
    project: t.project?.name || "Без проекта"
  }));

  const safeAnswers = answers.map(a => ({
    date: a.createdAt.toISOString().split('T')[0],
    time: a.createdAt.toISOString().split('T')[1].slice(0, 5),
    question: a.question?.text || "Свободный ответ / Итоги",
    answer: a.value
  }));

  // ДОБАВЛЕНО: Защита от пустых данных
  if (safeTasks.length === 0 && safeAnswers.length === 0) {
    return "⚠️ У сотрудника нет активных задач и за выбранный период нет ни одного ответа — отчёт не сгенерирован, генерировать не из чего.";
  }

  const periodText = period === "week" ? "последние 7 дней" : "сегодняшний день";
  const prompt = `
    Ты ассистент IT-команды. Составь сводный отчет по сотруднику "${user.name}" за ${periodText}.
    
    📋 Текущие задачи сотрудника (по всем проектам):
    ${JSON.stringify(safeTasks, null, 2)}

    💬 Ответы сотрудника на опросники за выбранный период:
    ${JSON.stringify(safeAnswers, null, 2)}
    
    Сделай структуру:
    1. 🎯 Чем занимался (обзор задач по проектам и их статусы)
    2. 📅 Сводка по ответам (если период - неделя, разбей по дням или выдели главные тренды)
    3. ⛔ Блокеры и проблемы за период (если были)
    4. 💬 Важные детали
    
    Пиши профессионально, используй эмодзи для списков. Без воды. Если ответов или задач нет — так и напиши.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return "Не удалось сгенерировать отчет из-за ошибки сервиса AI.";
  }
}