"use client";
import { updateTaskStatus } from "../actions/projects";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

export default function StatusSelect({ taskId, currentStatus }: { taskId: string, currentStatus: string }) {
  return (
    <form action={updateTaskStatus} className="inline-block m-0 p-0">
      <input type="hidden" name="taskId" value={taskId} />
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`text-xs px-2 py-1 rounded font-medium cursor-pointer border border-transparent hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${STATUS_COLORS[currentStatus] || STATUS_COLORS.TODO}`}
      >
        <option value="TODO">TODO</option>
        <option value="IN_PROGRESS">IN_PROGRESS</option>
        <option value="DONE">DONE</option>
        <option value="BLOCKED">BLOCKED</option>
      </select>
    </form>
  );
}