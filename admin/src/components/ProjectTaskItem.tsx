"use client";
import { useState } from "react";
import { updateTask, deleteTask } from "../actions/projects";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

export default function ProjectTaskItem({ task, projectUsers }: { task: any, projectUsers: any[] }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    const deadlineStr = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : "";
    return (
      <form action={async (fd) => { await updateTask(fd); setIsEditing(false); }} className="bg-gray-50 p-3 border rounded text-sm space-y-2 mb-2">
        <input type="hidden" name="taskId" value={task.id} />
        <input name="title" defaultValue={task.title} required className="w-full p-1.5 border rounded" />
        <div className="flex gap-2">
          <select name="assigneeId" defaultValue={task.assigneeId || ""} className="p-1.5 border rounded flex-1">
            <option value="">Без исполнителя</option>
            {projectUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" name="deadline" defaultValue={deadlineStr} className="p-1.5 border rounded text-gray-500" />
          <select name="status" defaultValue={task.status} className="p-1.5 border rounded">
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">Сохранить</button>
          <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-300">Отмена</button>
        </div>
      </form>
    );
  }

  return (
    <div className="text-sm p-3 border rounded flex flex-col bg-gray-50 mb-2">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-medium text-gray-900">{task.title}</div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
            <span>Исполнитель: {task.assignee?.name || "Не назначен"}</span>
            {task.assignee && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${task.acknowledgedAt ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {task.acknowledgedAt 
                  ? `✅ подтверждено ${new Date(task.acknowledgedAt).toLocaleString("ru-RU", { dateStyle: 'short', timeStyle: 'short' })}` 
                  : '⏳ не открывал(а)'}
              </span>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_COLORS[task.status]}`}>
          {task.status}
        </span>
      </div>
      <div className="flex gap-4 text-xs border-t pt-2 mt-1">
        <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:underline">✏️ Редактировать</button>
        <form action={deleteTask} onSubmit={(e) => !confirm(`Точно удалить задачу "${task.title}"?`) && e.preventDefault()}>
          <input type="hidden" name="taskId" value={task.id} />
          <button type="submit" className="text-red-600 hover:underline">🗑 Удалить</button>
        </form>
      </div>
    </div>
  );
}