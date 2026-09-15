"use client";
import { useState } from "react";
import { createQuestion } from "../actions/questions";

type Option = { id: string; name: string };

export default function QuestionForm({ roles, users }: { roles: Option[], users: Option[] }) {
  const [type, setType] = useState("TEXT");
  const [targetType, setTargetType] = useState("GENERAL");

  return (
    <form action={createQuestion} className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-medium mb-4">Добавить новый вопрос</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Текст вопроса</label>
          <input name="text" required className="w-full p-2 border rounded" placeholder="Например: Во сколько начал работу?" />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тип ответа</label>
          <select name="type" value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border rounded">
            <option value="TEXT">Текст</option>
            <option value="NUMBER">Число</option>
            <option value="TIME">Время</option>
            <option value="YES_NO">Да / Нет</option>
            <option value="SELECT">Выбор из списка</option>
          </select>
        </div>
      </div>

      {type === "SELECT" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Варианты (через запятую)</label>
          <input name="options" required className="w-full p-2 border rounded" placeholder="Вариант 1, Вариант 2, Другое..." />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Когда задавать?</label>
          <select name="checkInTime" className="w-full p-2 border rounded">
            <option value="MORNING">Утром (План)</option>
            <option value="EVENING">Вечером (Итоги)</option>
            <option value="BOTH">Утром и Вечером</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Привязка</label>
          <select name="targetType" value={targetType} onChange={e => setTargetType(e.target.value)} className="w-full p-2 border rounded">
            <option value="GENERAL">Общий (Всем)</option>
            <option value="ROLE">Для определённой роли</option>
            <option value="USER">Персонально сотруднику</option>
          </select>
        </div>
      </div>

      {targetType === "ROLE" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Выберите роль</label>
          <select name="targetRoleId" className="w-full p-2 border rounded" required>
            <option value="">-- Выберите --</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      {targetType === "USER" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Выберите сотрудника</label>
          <select name="targetUserId" className="w-full p-2 border rounded" required>
            <option value="">-- Выберите --</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      <div className="mb-6 flex items-center">
        <input type="checkbox" name="isRequired" id="isRequired" defaultChecked className="mr-2" />
        <label htmlFor="isRequired" className="text-sm text-gray-700">Обязательный вопрос</label>
      </div>

      <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition">
        Сохранить вопрос
      </button>
    </form>
  );
}