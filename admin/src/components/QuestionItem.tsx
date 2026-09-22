"use client";
import { useState } from "react";
import Link from "next/link"; // <-- ДОБАВЛЕНО
import QuestionForm from "./QuestionForm";
import { deleteQuestion } from "../actions/questions";

const getTargetLabel = (q: any) => {
  if (q.targetRole) return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">Роль: {q.targetRole.name}</span>;
  if (q.targetUser) return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">Перс: {q.targetUser.name}</span>;
  return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Общий</span>;
};

export default function QuestionItem({ q, roles, users, }: any) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="mb-3">
        <QuestionForm question={q} roles={roles} users={users} onCancel={() => setIsEditing(false)} />
      </div>
    );
  }

  return (
    <div className="border border-gray-200 bg-white p-4 rounded-lg flex flex-col justify-between mb-3 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <div>
          <strong className="block mb-1">{q.text}</strong>
          <div className="flex gap-2 text-sm text-gray-500 flex-wrap mt-1">
            <span>Тип: <b className="font-medium">{q.type}</b></span>
            {(q.type === "SELECT" || q.type === "MULTI_SELECT") && <span className="text-xs">({q.options.join(", ")})</span>}
            <span>|</span>
            
            {q.scheduleType === "EXACT_TIME" && <span>📅 Разово: {new Date(q.exactTime).toLocaleString('ru-RU')}</span>}
            {q.scheduleType === "RECURRING" && <span>🔄 Циклично: {q.recurrenceInterval === "DAILY" ? "Ежедневно" : `Еженедельно (день ${q.recurrenceDay})`} в {q.recurrenceTime}</span>}
            
            <span>|</span>
            <span>{q.isRequired ? "Обязательный" : "Опциональный"}</span>
            <span>|</span>
            <span className={q.includeInReport ? "text-purple-600 font-medium" : "text-gray-400 line-through"}>
              {q.includeInReport ? "В отчёте" : "Не в отчёте"}
            </span>
          </div>
        </div>
        <div>
          {getTargetLabel(q)}
        </div>
      </div>
      
      <div className="flex justify-start items-center gap-4 text-xs mt-2 border-t pt-3">
        <Link href={`/questions/${q.id}`} className="text-purple-600 hover:underline font-medium">
          📊 История ответов
        </Link>
        <span className="text-gray-300">|</span>
        
        {/* ЛОГИКА СКРЫТИЯ КНОПКИ РЕДАКТИРОВАНИЯ */}
        {(q.scheduleType === "EXACT_TIME" && q.deliveries?.length > 0) ? (
          <span className="text-gray-500 italic">
            ✅ Отправлен {new Date(q.deliveries[0].createdAt).toLocaleString("ru-RU", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:underline">
            ✏️ Изменить
          </button>
        )}
        
        <form action={deleteQuestion} onSubmit={(e) => !confirm(`Удалить вопрос "${q.text}"?`) && e.preventDefault()}>
          <input type="hidden" name="id" value={q.id} />
          <button type="submit" className="text-red-600 hover:underline">🗑 Удалить</button>
        </form>
      </div>
    </div>
  );
}