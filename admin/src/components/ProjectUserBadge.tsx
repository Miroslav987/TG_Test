"use client";
import { removeUserFromProject } from "../actions/projects";

export default function ProjectUserBadge({ user, projectId }: { user: any, projectId: string }) {
  return (
    <div className="bg-gray-100 px-2 py-1 rounded text-sm flex items-center gap-1">
      <span>{user.name}</span>
      <form action={removeUserFromProject} onSubmit={(e) => !confirm(`Удалить ${user.name} из проекта?`) && e.preventDefault()}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="userId" value={user.id} />
        <button type="submit" className="text-red-400 hover:text-red-600 font-bold ml-1 px-1 leading-none rounded">
          &times;
        </button>
      </form>
    </div>
  );
}