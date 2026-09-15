"use client";
import { useState } from "react";
import { updateUserSchedule } from "../actions/users";

const TIMEZONES = [
  "Europe/Moscow", "Asia/Bishkek", "Asia/Almaty", 
  "Asia/Tashkent", "Asia/Tbilisi", "Asia/Yerevan", 
  "Europe/Kyiv", "Europe/London", "UTC"
];

const DAYS = [
  { id: 1, label: "Пн" }, { id: 2, label: "Вт" }, { id: 3, label: "Ср" },
  { id: 4, label: "Чт" }, { id: 5, label: "Пт" }, { id: 6, label: "Сб" }, { id: 7, label: "Вс" }
];

export default function EditSchedule({ user }: { user: any }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="text-xs text-blue-600 hover:underline mt-2">
        ✏️ Изменить график
      </button>
    );
  }

  return (
    <form action={async (fd) => { await updateUserSchedule(fd); setIsOpen(false); }} className="mt-4 p-4 bg-gray-50 border rounded-lg text-sm">
      <input type="hidden" name="userId" value={user.id} />
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-gray-600 mb-1">Часовой пояс</label>
          <select name="timezone" defaultValue={user.timezone} className="w-full p-1.5 border rounded">
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="block text-gray-600 mb-1">Начало</label>
            <input type="time" name="workStart" defaultValue={user.workStart} required className="w-full p-1.5 border rounded" />
          </div>
          <div>
            <label className="block text-gray-600 mb-1">Конец</label>
            <input type="time" name="workEnd" defaultValue={user.workEnd} required className="w-full p-1.5 border rounded" />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-gray-600 mb-2">Рабочие дни</label>
        <div className="flex gap-3 flex-wrap">
          {DAYS.map(day => (
            <label key={day.id} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" name="workDays" value={day.id} defaultChecked={user.workDays.includes(day.id)} />
              {day.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">Сохранить</button>
        <button type="button" onClick={() => setIsOpen(false)} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-300">Отмена</button>
      </div>
    </form>
  );
}