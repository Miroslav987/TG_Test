import { prisma } from "@standup/shared";
import {
  createProject,
  addUserToProject,
  createTask,
  toggleProjectStatus,
  deleteProject,
} from "../../actions/projects";
import DeleteProjectButton from "@/components/DeleteProjectButton";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

export default async function ProjectsPage() {
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const projects = await prisma.project.findMany({
    include: {
      users: true,
      tasks: { include: { assignee: true } },
      _count: { select: { tasks: true, reports: true } }, // ДОБАВЛЕНО
    },
    orderBy: { name: "asc" },
  });

  const activeProjects = projects.filter((p) => p.isActive);
  const archivedProjects = projects.filter((p) => !p.isActive);

  const ProjectCard = ({ project }: { project: any }) => {
    const availableUsers = allUsers.filter(
      (u) => !project.users.some((pu: any) => pu.id === u.id),
    );
    const canDelete =
      project._count.tasks === 0 && project._count.reports === 0;

    return (
      <div
        className={`bg-white border p-6 rounded-lg shadow-sm ${!project.isActive ? "opacity-70 bg-gray-50" : ""}`}
      >
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b pb-4">
          <h2 className="text-xl font-bold">
            {project.name} {!project.isActive && "(Архив)"}
          </h2>

          <div className="flex items-center gap-4 text-sm font-medium">
            <form action={toggleProjectStatus}>
              <input type="hidden" name="projectId" value={project.id} />
              <input
                type="hidden"
                name="isActive"
                value={String(project.isActive)}
              />
              <button type="submit" className="text-orange-600 hover:underline">
                {project.isActive ? "📦 Архивировать" : "✅ Разархивировать"}
              </button>
            </form>

            {canDelete ? (
              <DeleteProjectButton
                projectId={project.id}
                projectName={project.name}
              />
            ) : (
              <span
                className="text-gray-400 text-xs italic"
                title="Удалите все задачи и отчёты перед полным удалением"
              >
                Нельзя удалить — есть история, используйте архивацию
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-semibold mb-2 text-gray-700 border-b pb-1">
              Участники ({project.users.length})
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {project.users.map((u: any) => (
                <span
                  key={u.id}
                  className="bg-gray-100 px-2 py-1 rounded text-sm"
                >
                  {u.name}
                </span>
              ))}
              {project.users.length === 0 && (
                <span className="text-gray-500 text-sm">Нет участников</span>
              )}
            </div>

            {availableUsers.length > 0 && project.isActive && (
              <form action={addUserToProject} className="flex gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <select
                  name="userId"
                  required
                  className="p-1.5 border rounded text-sm flex-1"
                >
                  <option value="">Добавить сотрудника...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-700"
                >
                  Добавить
                </button>
              </form>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2 text-gray-700 border-b pb-1">
              Задачи проекта
            </h3>
            <div className="space-y-2 mb-4">
              {project.tasks.map((task: any) => (
                <div
                  key={task.id}
                  className="text-sm p-2 border rounded flex justify-between items-center bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{task.title}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span>
                        Исполнитель: {task.assignee?.name || "Не назначен"}
                      </span>
                      {task.assignee && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${task.acknowledgedAt ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}
                        >
                          {task.acknowledgedAt
                            ? `✅ подтверждено ${new Date(task.acknowledgedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
                            : "⏳ не открывал(а)"}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium ${STATUS_COLORS[task.status]}`}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
              {project.tasks.length === 0 && (
                <span className="text-gray-500 text-sm">Нет задач</span>
              )}
            </div>

            {project.isActive && (
              <form
                action={createTask}
                className="bg-gray-50 p-3 border rounded text-sm space-y-2 mt-4"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <input
                  name="title"
                  placeholder="Название новой задачи"
                  required
                  className="w-full p-1.5 border rounded"
                />
                <div className="flex gap-2">
                  <select
                    name="assigneeId"
                    className="p-1.5 border rounded flex-1"
                  >
                    <option value="">Без исполнителя</option>
                    {project.users.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="deadline"
                    className="p-1.5 border rounded text-gray-500"
                    title="Дедлайн"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 mt-2"
                >
                  Добавить задачу
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Проекты</h1>

      <form
        action={createProject}
        className="mb-8 p-6 bg-white rounded-lg shadow-sm border max-w-md"
      >
        <h3 className="text-lg font-medium mb-4">Создать новый проект</h3>
        <input
          name="name"
          placeholder="Название проекта"
          required
          className="w-full mb-3 p-2 border rounded"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Создать
        </button>
      </form>

      <div className="space-y-6 mb-12">
        {activeProjects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {archivedProjects.length > 0 && (
        <details className="group border rounded-lg bg-white shadow-sm overflow-hidden">
          <summary className="p-4 bg-gray-50 cursor-pointer font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-between select-none">
            Архивные проекты ({archivedProjects.length})
            <span className="text-gray-400 group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>
          <div className="p-6 space-y-6">
            {archivedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
