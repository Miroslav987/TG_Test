"use client";
import { useState } from "react";
import { createQuestion, updateQuestion } from "../actions/questions";

type Option = { id: string; name: string };

function toLocalISO(dateString?: string | Date) {
  if (!dateString) return "";
  const d = new Date(dateString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function QuestionForm({ roles, users, question, onCancel }: { roles: Option[], users: Option[], question?: any, onCancel?: () => void }) {
  const [type, setType] = useState(question?.type || "TEXT");
  // CHECK_IN больше не используем для новых вопросов
  const initialSchedule = question?.scheduleType === "CHECK_IN" ? "RECURRING" : (question?.scheduleType || "RECURRING");
  const [scheduleType, setScheduleType] = useState(initialSchedule);
  const [recInterval, setRecInterval] = useState(question?.recurrenceInterval || "DAILY");
  
  const defaultTarget = question?.targetRoleId ? "ROLE" : (question?.targetUserId ? "USER" : "GENERAL");
  const [targetType, setTargetType] = useState(defaultTarget);

  const formAction = async (formData: FormData) => {
    if (question) {
      await updateQuestion(formData);
      if (onCancel) onCancel();
    } else {
      await createQuestion(formData);
      setType("TEXT"); setScheduleType("RECURRING");
    }
  };

  return (
    <form action={formAction} className="mb-4 p-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-medium mb-4">{question ? "Редактировать вопрос" : "Добавить новый вопрос"}</h3>
      {question && <input type="hidden" name="id" value={question.id} />}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Текст вопроса</label>
          <input name="text" defaultValue={question?.text} required className="w-full p-2 border rounded" placeholder="Например: Что планируешь сделать?" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тип ответа</label>
          <select name="type" value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border rounded">
            <option value="TEXT">Текст (свободный)</option>
            <option value="NUMBER">Число</option>
            <option value="TIME">Время</option>
            <option value="YES_NO">Да / Нет</option>
            <option value="SELECT">Выбор из списка (Один)</option>
            <option value="MULTI_SELECT">Множественный выбор (Чекбоксы)</option>
          </select>
        </div>
      </div>

      {(type === "SELECT" || type === "MULTI_SELECT") && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Варианты (через запятую)</label>
          <input name="options" defaultValue={question?.options?.join(", ")} required className="w-full p-2 border rounded" placeholder="Вариант 1, Вариант 2" />
        </div>
      )}

      {/* --- БЛОК ПЛАНИРОВАНИЯ --- */}
      <div className="bg-gray-50 p-4 border rounded mb-4">
        <label className="block text-sm font-bold text-gray-700 mb-2">Настройка отправки (Расписание)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Тип расписания</label>
            <select name="scheduleType" value={scheduleType} onChange={e => setScheduleType(e.target.value)} className="w-full p-2 border rounded">
              <option value="EXACT_TIME">Разово (Точная дата и время)</option>
              <option value="RECURRING">Циклично (Каждый день/неделю)</option>
            </select>
          </div>

          {scheduleType === "EXACT_TIME" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Дата и время (по вашему местному времени)</label>
              <input type="datetime-local" name="exactTime" defaultValue={toLocalISO(question?.exactTime)} required className="w-full p-2 border rounded" />
            </div>
          )}

          {scheduleType === "RECURRING" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Повтор</label>
                <select name="recurrenceInterval" value={recInterval} onChange={e => setRecInterval(e.target.value)} className="w-full p-2 border rounded">
                  <option value="DAILY">Каждый день</option>
                  <option value="WEEKLY">Каждую неделю</option>
                </select>
              </div>
              {recInterval === "WEEKLY" && (
                <div className="w-1/3">
                  <label className="block text-xs text-gray-500 mb-1">День недели</label>
                  <select name="recurrenceDay" defaultValue={question?.recurrenceDay || 1} className="w-full p-2 border rounded">
                    <option value="1">Пн</option><option value="2">Вт</option><option value="3">Ср</option>
                    <option value="4">Чт</option><option value="5">Пт</option><option value="6">Сб</option><option value="7">Вс</option>
                  </select>
                </div>
              )}
              <div className="w-1/3">
                <label className="block text-xs text-gray-500 mb-1">Время (напр. 09:00)</label>
                <input type="time" name="recurrenceTime" defaultValue={question?.recurrenceTime || "09:00"} required className="w-full p-2 border rounded" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Привязка (Кому задавать?)</label>
          <select name="targetType" value={targetType} onChange={e => setTargetType(e.target.value)} className="w-full p-2 border rounded">
            <option value="GENERAL">Общий (Всем)</option>
            <option value="ROLE">Для определённой роли</option>
            <option value="USER">Персонально сотруднику</option>
          </select>
        </div>

        {targetType === "ROLE" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Выберите роль</label>
            <select name="targetRoleId" defaultValue={question?.targetRoleId || ""} className="w-full p-2 border rounded" required>
              <option value="">-- Выберите --</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        {targetType === "USER" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Выберите сотрудника</label>
            <select name="targetUserId" defaultValue={question?.targetUserId || ""} className="w-full p-2 border rounded" required>
              <option value="">-- Выберите --</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mb-6 flex gap-6 items-center border-t pt-4">
        <label className="flex items-center text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" name="isRequired" defaultChecked={question ? question.isRequired : true} className="mr-2 h-4 w-4 text-blue-600" />
          Обязательный вопрос
        </label>
        
        <label className="flex items-center text-sm font-medium text-purple-700 cursor-pointer">
          <input type="checkbox" name="includeInReport" defaultChecked={question ? question.includeInReport : true} className="mr-2 h-4 w-4 text-purple-600" />
          📊 Добавлять ответы в сводные отчёты ИИ
        </label>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition">
          {question ? "Сохранить изменения" : "Создать вопрос"}
        </button>
        {question && onCancel && (
          <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300">Отмена</button>
        )}
      </div>
    </form>
  );
}