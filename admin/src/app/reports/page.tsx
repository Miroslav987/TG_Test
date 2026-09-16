import { prisma } from "@standup/shared";
import { generateAndSaveReport, generateAndSaveEmployeeReport } from "../../actions/reports";
import Link from "next/link";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; projectId?: string; userId?: string }>;
}) {
  // Добавили await для получения значений из searchParams
  const resolvedSearchParams = await searchParams;
  const type = resolvedSearchParams.type === "employee" ? "employee" : "project";
  const projectId = resolvedSearchParams.projectId;
  const userId = resolvedSearchParams.userId;

  // Данные для селектов
  const projects = await prisma.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  // Получаем историю отчетов в зависимости от активного таба
  let reports: any[] = [];
  if (type === "project" && projectId) {
    reports = await prisma.report.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  } else if (type === "employee" && userId) {
    reports = await prisma.report.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  const selectedProject = projects.find(p => p.id === projectId);
  const selectedUser = users.find(u => u.id === userId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Сводные отчёты (Gemini AI)</h1>
      
      {/* Навигация (Табы) */}
      <div className="flex border-b mb-6">
        <Link 
          href="/reports?type=project" 
          className={`px-4 py-2 border-b-2 font-medium ${type === 'project' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          По проекту
        </Link>
        <Link 
          href="/reports?type=employee" 
          className={`px-4 py-2 border-b-2 font-medium ${type === 'employee' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          По сотруднику
        </Link>
      </div>

      {/* ТАБ: ПО ПРОЕКТУ */}
      {type === "project" && (
        <>
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 flex flex-col md:flex-row items-end gap-4 max-w-2xl">
            <form method="GET" action="/reports" className="flex-1 w-full">
              <input type="hidden" name="type" value="project" />
              <label className="block text-sm font-medium text-gray-700 mb-2">Выберите активный проект:</label>
              <div className="flex gap-2">
                <select name="projectId" defaultValue={projectId || ""} className="flex-1 p-2 border rounded">
                  <option value="" disabled>-- Не выбран --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="submit" className="bg-gray-100 text-gray-800 px-4 py-2 border rounded hover:bg-gray-200">
                  Показать
                </button>
              </div>
            </form>
            
            {projectId && (
              <form action={generateAndSaveReport}>
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" className="w-full md:w-auto bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 whitespace-nowrap">
                  ✨ Сгенерировать отчёт
                </button>
              </form>
            )}
          </div>

          {projectId && (
            <div>
              <h2 className="text-xl font-bold mb-4">История отчётов: {selectedProject?.name}</h2>
              <ReportsList reports={reports} />
            </div>
          )}
        </>
      )}

      {/* ТАБ: ПО СОТРУДНИКУ */}
      {type === "employee" && (
        <>
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 max-w-2xl">
            <form method="GET" action="/reports" className="mb-4">
              <input type="hidden" name="type" value="employee" />
              <label className="block text-sm font-medium text-gray-700 mb-2">Выберите сотрудника:</label>
              <div className="flex gap-2">
                <select name="userId" defaultValue={userId || ""} className="flex-1 p-2 border rounded">
                  <option value="" disabled>-- Не выбран --</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button type="submit" className="bg-gray-100 text-gray-800 px-4 py-2 border rounded hover:bg-gray-200">
                  Показать
                </button>
              </div>
            </form>
            
            {userId && (
              <form action={generateAndSaveEmployeeReport} className="flex gap-2 mt-4 pt-4 border-t items-end">
                <input type="hidden" name="userId" value={userId} />
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Период для нового отчёта:</label>
                  <select name="period" className="w-full p-2 border rounded">
                    <option value="today">Сегодня</option>
                    <option value="week">За последние 7 дней</option>
                  </select>
                </div>
                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 whitespace-nowrap">
                  ✨ Сгенерировать
                </button>
              </form>
            )}
          </div>

          {userId && (
            <div>
              <h2 className="text-xl font-bold mb-4">История отчётов: {selectedUser?.name}</h2>
              <ReportsList reports={reports} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportsList({ reports }: { reports: any[] }) {
  if (reports.length === 0) {
    return <p className="text-gray-500">Отчётов пока нет. Нажмите кнопку генерации выше.</p>;
  }

  return (
    <div className="space-y-6">
      {reports.map((report, idx) => (
        <div key={report.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3 flex justify-between items-center">
            <span className="font-semibold text-gray-700">Отчёт #{reports.length - idx}</span>
            <span className="text-sm text-gray-500">
              {new Date(report.createdAt).toLocaleString("ru-RU", { dateStyle: 'long', timeStyle: 'short' })}
            </span>
          </div>
          <div className="p-4 text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
            {report.content}
          </div>
        </div>
      ))}
    </div>
  );
}