import { prisma } from "@standup/shared";
import { createProject, addUserToProject, createTask } from "../../actions/projects";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

export default async function ProjectsPage() {
  const allUsers = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  const projects = await prisma.project.findMany({
    include: { users: true, tasks: { include: { assignee: true } } },
    orderBy: { name: 'asc' }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Проекты</h1>

      <form action={createProject} className="mb-8 p-6 bg-white rounded-lg shadow-sm border max-w-md">
        <h3 className="text-lg font-medium mb-4">Создать новый проект</h3>
        <input name="name" placeholder="Название проекта" required className="w-full mb-3 p-2 border rounded" />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Создать</button>
      </form>

      <div className="space-y-6">
        {projects.map(project => {
          // Фильтруем юзеров, которых еще нет в проекте
          const availableUsers = allUsers.filter(u => !project.users.some(pu => pu.id === u.id));

          return (
            <div key={project.id} className="bg-white border p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-bold mb-4">{project.name}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Левая колонка: Участники */}
                <div>
                  <h3 className="font-semibold mb-2 text-gray-700 border-b pb-1">Участники ({project.users.length})</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {project.users.map(u => (
                      <span key={u.id} className="bg-gray-100 px-2 py-1 rounded text-sm">{u.name}</span>
                    ))}
                    {project.users.length === 0 && <span className="text-gray-500 text-sm">Нет участников</span>}
                  </div>
                  
                  {availableUsers.length > 0 && (
                    <form action={addUserToProject} className="flex gap-2">
                      <input type="hidden" name="projectId" value={project.id} />
                      <select name="userId" required className="p-1.5 border rounded text-sm flex-1">
                        <option value="">Добавить сотрудника...</option>
                        {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button type="submit" className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-700">Добавить</button>
                    </form>
                  )}
                </div>

                {/* Правая колонка: Задачи */}
                <div>
                  <h3 className="font-semibold mb-2 text-gray-700 border-b pb-1">Задачи проекта</h3>
                  <div className="space-y-2 mb-4">
                    {project.tasks.map(task => (
                      <div key={task.id} className="text-sm p-2 border rounded flex justify-between items-center bg-gray-50">
                        <div>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-gray-500">Исполнитель: {task.assignee?.name || "Не назначен"}</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_COLORS[task.status]}`}>
                          {task.status}
                        </span>
                      </div>
                    ))}
                    {project.tasks.length === 0 && <span className="text-gray-500 text-sm">Нет задач</span>}
                  </div>

                  <form action={createTask} className="bg-gray-50 p-3 border rounded text-sm space-y-2 mt-4">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input name="title" placeholder="Название новой задачи" required className="w-full p-1.5 border rounded" />
                    <div className="flex gap-2">
                      <select name="assigneeId" className="p-1.5 border rounded flex-1">
                        <option value="">Без исполнителя</option>
                        {project.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <input type="date" name="deadline" className="p-1.5 border rounded text-gray-500" title="Дедлайн" />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 mt-2">Добавить задачу</button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}