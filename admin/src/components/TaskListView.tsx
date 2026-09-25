import { prisma } from "@standup/shared";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

export default async function TaskListView({ userId }: { userId: string }) {
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId },
    include: { project: true },
    orderBy: { createdAt: 'desc' }
  });

  if (tasks.length === 0) {
    return <p className="text-gray-500 bg-white p-6 rounded-lg border">Задач пока нет.</p>;
  }

  const grouped = tasks.reduce((acc, task) => {
    const pName = task.project?.name ?? "Без проекта";
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(task);
    return acc;
  }, {} as Record<string, typeof tasks>);

  const pNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Без проекта") return 1;
    if (b === "Без проекта") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      {pNames.map(pName => (
        <div key={pName} className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3">
            <h3 className="font-bold text-gray-800">{pName === "Без проекта" ? "📋 Без проекта" : `📂 ${pName}`}</h3>
          </div>
          <div className="p-4 space-y-3">
            {grouped[pName].map((task: any) => {
              const deadlineText = task.deadline ? new Date(task.deadline).toLocaleDateString('ru-RU') : null;
              
              return (
                <div key={task.id} className="text-sm p-3 border rounded flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 gap-4">
                  <div>
                    <div className="font-medium text-gray-900">{task.title}</div>
                    {deadlineText && <div className="text-xs text-red-500 mt-1">⏳ Дедлайн: {deadlineText}</div>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${STATUS_COLORS[task.status]}`}>
                    {task.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}