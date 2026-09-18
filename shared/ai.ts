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

  // 1. Стандартные ответы через чек-ины
  const checkIns = await prisma.checkIn.findMany({
    where: { userId: { in: userIds }, createdAt: { gte: today } },
    include: {
      user: { select: { name: true } },
      answers: { 
        where: { OR: [ { question: { includeInReport: true } }, { questionId: null } ] },
        include: { question: { select: { text: true } } }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // 2. Ответы на плановые опросы (без чек-ина)
  const standaloneAnswers = await prisma.answer.findMany({
    where: {
      userId: { in: userIds },
      checkInId: null,
      createdAt: { gte: today },
      OR: [ { question: { includeInReport: true } }, { questionId: null } ]
    },
    include: {
      user: { select: { name: true } },
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

  const safeCheckIns = checkIns.map(c => ({
    user: c.user.name,
    type: c.type,
    answers: c.answers.map(a => ({
      question: a.question?.text || "Свободный ответ / Планы",
      answer: a.value
    }))
  }));

  const safeStandaloneAnswers = standaloneAnswers.map(a => ({
    user: a.user?.name || "Неизвестно",
    time: a.createdAt.toISOString().split('T')[1].slice(0, 5),
    question: a.question?.text || "Свободный ответ",
    answer: a.value
  }));

  // ЗАЩИТА: Если нет вообще никаких данных, не дёргаем ИИ
  if (safeTasks.length === 0 && safeCheckIns.length === 0 && safeStandaloneAnswers.length === 0) {
    return "⚠️ В проекте нет активных задач, а за выбранный период нет ни одного ответа — отчёт не сгенерирован, генерировать не из чего.";
  }

  const prompt = `
    Ты ассистент IT-команды. Составь четкий и лаконичный отчет по проекту "${project.name}".
    
    📋 Список задач в проекте:
    ${JSON.stringify(safeTasks, null, 2)}

    💬 Данные из чек-инов (планы, итоги дня):
    ${JSON.stringify(safeCheckIns, null, 2)}
    
    📩 Ответы на опросы (вне чек-инов):
    ${JSON.stringify(safeStandaloneAnswers, null, 2)}
    
    Сделай структуру:
    1. 🎯 Что сделано (задачи в статусе DONE)
    2. 🔄 В работе (задачи IN_PROGRESS)
    3. ⛔ Заблокировано (задачи BLOCKED)
    4. 👥 Кто чем занимался (краткая сводка по сотрудникам на основе задач, чек-инов и опросов)
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

  // 1. Стандартные ответы через чек-ины
  const checkIns = await prisma.checkIn.findMany({
    where: { userId: userId, createdAt: { gte: since } },
    include: { 
      answers: { 
        where: { OR: [ { question: { includeInReport: true } }, { questionId: null } ] },
        include: { question: { select: { text: true } } } 
      } 
    },
    orderBy: { createdAt: 'asc' }
  });

  // 2. Ответы на плановые опросы (без чек-ина)
  const standaloneAnswers = await prisma.answer.findMany({
    where: {
      userId: userId,
      checkInId: null,
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

  const safeCheckIns = checkIns.map(c => ({
    date: c.createdAt.toISOString().split('T')[0],
    type: c.type,
    answers: c.answers.map(a => ({
      question: a.question?.text || "Свободный ответ / Итоги",
      answer: a.value
    }))
  }));

  const safeStandaloneAnswers = standaloneAnswers.map(a => ({
    date: a.createdAt.toISOString().split('T')[0],
    time: a.createdAt.toISOString().split('T')[1].slice(0, 5),
    question: a.question?.text || "Свободный ответ",
    answer: a.value
  }));

  // ЗАЩИТА: Если нет вообще никаких данных, не дёргаем ИИ
  if (safeTasks.length === 0 && safeCheckIns.length === 0 && safeStandaloneAnswers.length === 0) {
    return "⚠️ У сотрудника нет активных задач и за выбранный период нет ни одного ответа — отчёт не сгенерирован, генерировать не из чего.";
  }

  const periodText = period === "week" ? "последние 7 дней" : "сегодняшний день";
  const prompt = `
    Ты ассистент IT-команды. Составь сводный отчет по сотруднику "${user.name}" за ${periodText}.
    
    📋 Текущие задачи сотрудника (по всем проектам):
    ${JSON.stringify(safeTasks, null, 2)}

    💬 Ответы в чек-инах за выбранный период:
    ${JSON.stringify(safeCheckIns, null, 2)}
    
    📩 Ответы на плановые опросы (вне чек-инов):
    ${JSON.stringify(safeStandaloneAnswers, null, 2)}
    
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