import { prisma } from "@standup/shared";
import { generateAndSaveReport } from "../../actions/reports";

export default async function ReportsPage({ searchParams }: { searchParams: { projectId?: string } }) {
  // ДОБАВЛЕНО: where: { isActive: true }
  const projects = await prisma.project.findMany({ 
    where: { isActive: true }, 
    orderBy: { name: 'asc' } 
  });
  
  const projectId = searchParams.projectId;
  
  const reports = projectId 
    ? await prisma.report.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })
    : [];

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Сводные отчёты (Gemini AI)</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 flex items-end gap-4 max-w-2xl">
        <form method="GET" action="/reports" className="flex-1">
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
            <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 whitespace-nowrap">
              ✨ Сгенерировать новый отчёт
            </button>
          </form>
        )}
      </div>

      {projectId && (
        <div>
          <h2 className="text-xl font-bold mb-4">История отчётов: {selectedProject?.name}</h2>
          
          <div className="space-y-6">
            {reports.length === 0 ? (
              <p className="text-gray-500">Отчётов пока нет. Нажмите кнопку генерации выше.</p>
            ) : null}

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
        </div>
      )}
    </div>
  );
}