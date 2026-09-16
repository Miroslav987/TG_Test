"use client";
import { useState } from "react";
import QuestionForm from "./QuestionForm";
import { deleteQuestion } from "../actions/questions";

// Хелперы перенесены сюда
const getTargetLabel = (q: any) => {
  if (q.targetRole) return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">Роль: {q.targetRole.name}</span>;
  if (q.targetUser) return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">Перс: {q.targetUser.name}</span>;
  return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Общий</span>;
};

const getTimeLabel = (time: string) => {
  switch (time) {
    case "MORNING": return "🌅 Утро";
    case "EVENING": return "🌆 Вечер";
    default: return "Утро и Вечер";
  }
};

export default function QuestionItem({ q, roles, users }: any) {
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
          <div className="flex gap-2 text-sm text-gray-500 flex-wrap">
            <span>Тип: <b className="font-medium">{q.type}</b></span>
            {q.type === "SELECT" && <span className="text-xs">({q.options.join(", ")})</span>}
            <span>|</span>
            <span>Время: {getTimeLabel(q.checkInTime)}</span>
            <span>|</span>
            <span>{q.isRequired ? "Обязательный" : "Опциональный"}</span>
          </div>
        </div>
        <div>
          {getTargetLabel(q)}
        </div>
      </div>
      
      <div className="flex justify-start gap-4 text-xs mt-2 border-t pt-2">
        <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:underline">
          ✏️ Изменить
        </button>
        <form action={deleteQuestion} onSubmit={(e) => !confirm(`Удалить вопрос "${q.text}"?`) && e.preventDefault()}>
          <input type="hidden" name="id" value={q.id} />
          <button type="submit" className="text-red-600 hover:underline">🗑 Удалить</button>
        </form>
      </div>
    </div>
  );
}