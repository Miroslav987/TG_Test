"use client";
import { useState } from "react";
import { updateRole, deleteRole } from "../actions/roles";

export default function RoleItem({ role }: { role: any }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <form action={async (fd) => { await updateRole(fd); setIsEditing(false); }} className="border border-gray-200 bg-gray-50 p-4 rounded-lg flex gap-2">
        <input type="hidden" name="id" value={role.id} />
        <input name="name" defaultValue={role.name} required className="flex-1 p-1.5 border rounded" />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">Сохранить</button>
        <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-200 px-3 py-1.5 rounded hover:bg-gray-300">Отмена</button>
      </form>
    );
  }

  const hasUsers = role._count.users > 0;

  return (
    <div className="border border-gray-200 bg-white p-4 rounded-lg shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-center mb-4">
        <span className="font-semibold">{role.name}</span>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
          Сотрудников: {role._count.users}
        </span>
      </div>
      
      <div className="flex justify-between items-center text-xs mt-auto">
        <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:underline">
          ✏️ Изменить
        </button>
        
        {hasUsers ? (
          <span className="text-gray-400 cursor-not-allowed" title="Сначала отвяжите сотрудников от этой роли">
            Нельзя удалить (есть сотрудники)
          </span>
        ) : (
          <form action={deleteRole} onSubmit={(e) => !confirm(`Удалить роль "${role.name}"?`) && e.preventDefault()}>
            <input type="hidden" name="id" value={role.id} />
            <button type="submit" className="text-red-600 hover:underline">🗑 Удалить</button>
          </form>
        )}
      </div>
    </div>
  );
}