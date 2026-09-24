import { prisma } from "@standup/shared";
import { generateAndSaveReport, generateAndSaveEmployeeReport } from "../../actions/reports";
import Link from "next/link";

export default async function ReportsPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ type?: string, projectId?: string, userId?: string, period?: string, from?: string, to?: string }> 
}) {
  const sp = await searchParams; // Next.js 15+ 
  const type = sp.type === "employee" ? "employee" : "project";
  const period = sp.period || "week";
  const projectId = sp.projectId || "";
  const userId = sp.userId || "";
  const from = sp.from || "";
  const to = sp.to || "";

  const projects = await prisma.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  let reports: any[] = [];
  if (type === "project" && projectId) {
    reports = await prisma.report.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  } else if (type === "employee" && userId) {
    reports = await prisma.report.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  const selectedProject = projects.find(p => p.id === projectId);
  const selectedUser = users.find(u => u.id === userId);

  // Хелпер для сохранения стейта в URL
  const buildUrl = (overrides: Record<string, string>) => {
    const q = new URLSearchParams();
    q.set("type", overrides.type ?? type);
    q.set("period", overrides.period ?? period);
    if (overrides.from ?? from) q.set("from", overrides.from ?? from);
    if (overrides.to ?? to) q.set("to", overrides.to ?? to);
    if (overrides.projectId ?? projectId) q.set("projectId", overrides.projectId ?? projectId);
    if (overrides.userId ?? userId) q.set("userId", overrides.userId ?? userId);
    return `/reports?${q.toString()}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Сводные отчёты (Gemini AI)</h1>
      
      {/* 1. НАВИГАЦИЯ */}
      <div className="flex border-b mb-6">
        <Link href={buildUrl({ type: 'project' })} className={`px-4 py-2 border-b-2 font-medium ${type === 'project' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>По проекту</Link>
        <Link href={buildUrl({ type: 'employee' })} className={`px-4 py-2 border-b-2 font-medium ${type === 'employee' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>По сотруднику</Link>
      </div>

      {/* 2. ПИЛЮЛИ ВЫБОРА ПЕРИОДА */}
      <div className="flex gap-2 mb-6">
        <Link href={buildUrl({ period: 'week' })} className={`px-4 py-1.5 border rounded-full text-sm font-medium transition-colors ${period === 'week' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Эта неделя</Link>
        <Link href={buildUrl({ period: 'month' })} className={`px-4 py-1.5 border rounded-full text-sm font-medium transition-colors ${period === 'month' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Этот месяц</Link>
        <Link href={buildUrl({ period: 'custom' })} className={`px-4 py-1.5 border rounded-full text-sm font-medium transition-colors ${period === 'custom' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Свой период</Link>
      </div>

      {/* 3. ТАБ: ПО ПРОЕКТУ */}
      {type === "project" && (
        <>
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 flex flex-col xl:flex-row items-end gap-4 max-w-4xl">
            <form method="GET" action="/reports" className="flex-1 flex flex-wrap items-end gap-4 w-full">
              <input type="hidden" name="type" value="project" />
              <input type="hidden" name="period" value={period} />
              
              {period === "custom" && (
                <div className="flex gap-2">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">От:</label>
                    <input type="date" name="from" defaultValue={from} className="p-2 border rounded text-sm w-36" required />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">До:</label>
                    <input type="date" name="to" defaultValue={to} className="p-2 border rounded text-sm w-36" required />
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-[250px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Выберите активный проект:</label>
                <div className="flex gap-2">
                  <select name="projectId" defaultValue={projectId || ""} className="flex-1 p-2 border rounded text-sm">
                    <option value="" disabled>-- Не выбран --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button type="submit" className="bg-gray-100 text-gray-800 px-4 py-2 border rounded hover:bg-gray-200 text-sm font-medium">Показать</button>
                </div>
              </div>
            </form>

            {projectId && (
              <form action={generateAndSaveReport}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <button type="submit" className="w-full xl:w-auto bg-purple-600 text-white px-5 py-2 rounded shadow hover:bg-purple-700 whitespace-nowrap text-sm font-medium">
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

      {/* 4. ТАБ: ПО СОТРУДНИКУ */}
      {type === "employee" && (
        <>
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 flex flex-col xl:flex-row items-end gap-4 max-w-4xl">
            <form method="GET" action="/reports" className="flex-1 flex flex-wrap items-end gap-4 w-full">
              <input type="hidden" name="type" value="employee" />
              <input type="hidden" name="period" value={period} />
              
              {period === "custom" && (
                <div className="flex gap-2">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">От:</label>
                    <input type="date" name="from" defaultValue={from} className="p-2 border rounded text-sm w-36" required />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">До:</label>
                    <input type="date" name="to" defaultValue={to} className="p-2 border rounded text-sm w-36" required />
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-[250px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Выберите сотрудника:</label>
                <div className="flex gap-2">
                  <select name="userId" defaultValue={userId || ""} className="flex-1 p-2 border rounded text-sm">
                    <option value="" disabled>-- Не выбран --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <button type="submit" className="bg-gray-100 text-gray-800 px-4 py-2 border rounded hover:bg-gray-200 text-sm font-medium">Показать</button>
                </div>
              </div>
            </form>

            {userId && (
              <form action={generateAndSaveEmployeeReport}>
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <button type="submit" className="w-full xl:w-auto bg-purple-600 text-white px-5 py-2 rounded shadow hover:bg-purple-700 whitespace-nowrap text-sm font-medium">
                  ✨ Сгенерировать отчёт
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
    return <p className="text-gray-500 bg-white p-6 rounded border">Отчётов пока нет. Нажмите кнопку генерации выше.</p>;
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