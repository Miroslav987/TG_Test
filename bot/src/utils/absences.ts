import { prisma } from "../index";
import { formatInTimeZone } from "date-fns-tz";
import { endOfDay } from "date-fns";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function recalculateUserPause(userId: string) {
  const activeAbsences = await prisma.absence.findMany({
    where: { userId, status: "ACTIVE", type: { in: ["FULL_DAY", "RANGE"] } }
  });
  
  if (activeAbsences.length === 0) {
    await prisma.user.update({ where: { id: userId }, data: { pausedUntil: null } });
  } else {
    const maxDate = activeAbsences.reduce((max, abs) => abs.endDate > max ? abs.endDate : max, new Date(0));
    await prisma.user.update({ where: { id: userId }, data: { pausedUntil: endOfDay(maxDate) } });
  }
}

export function formatAbsence(abs: any, tz: string = "Asia/Bishkek") {
  const s = formatInTimeZone(abs.startDate, tz, 'dd.MM.yyyy');
  const e = formatInTimeZone(abs.endDate, tz, 'dd.MM.yyyy');
  if (abs.type === "FULL_DAY") return `на весь день ${s}`;
  if (abs.type === "RANGE") return `с ${s} по ${e}`;
  return `${s} с ${abs.startTime} до ${abs.endTime}`;
}

export async function parseAbsenceWithGemini(userInput: string, todayStr: string, currentAbsence: any = null) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let prompt = `Сегодняшняя дата (в часовом поясе Asia/Bishkek): ${todayStr}.\n`;
  if (currentAbsence) {
    prompt += `У пользователя УЖЕ ЕСТЬ отсутствие: ${JSON.stringify(currentAbsence)}.\n`;
    prompt += `Пользователь просит изменить его: "${userInput}"\n`;
    prompt += `Верни ОБНОВЛЁННЫЕ данные (если что-то не меняется, оставь старым).\n`;
  } else {
    prompt += `Сотрудник написал: "${userInput}"\n`;
  }

  prompt += `
  Разбери сообщение и верни СТРОГО валидный JSON без markdown-обёртки:
  {
    "type": "FULL_DAY" | "RANGE" | "PARTIAL_HOURS",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "startTime": "HH:mm" | null,
    "endTime": "HH:mm" | null,
    "reason": "краткая причина" | null
  }
  Правила:
  - Если один день -> FULL_DAY.
  - Если несколько дней -> RANGE.
  - Если с часами -> PARTIAL_HOURS.
  - Если сообщение не похоже на отсутствие или перенос -> {"error": true}.`;

  const result = await model.generateContent(prompt);
  const cleanedText = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanedText);
}

export const CANCEL_WORDS = ["стой", "отмена", "нет", "cancel"];