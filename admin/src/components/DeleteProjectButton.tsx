"use client";

import { deleteProject } from "../actions/projects";

export default function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <form
      action={deleteProject}
      onSubmit={(e) => {
        if (!confirm(`Удалить проект "${projectName}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <button type="submit" className="text-red-600 hover:underline">
        🗑 Удалить
      </button>
    </form>
  );
}