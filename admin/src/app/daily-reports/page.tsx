import { prisma } from "@standup/shared";
import StatusSelect from "../../components/StatusSelect";
import { startOfDay, endOfDay } from "date-fns";

export default async function DailyReportsPage() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const activeUsers = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  // Получаем вечерние чекины за сегодня
  const eveningCheckIns = await prisma.checkIn.findMany({
    where: { type: "EVENING", createdAt: { gte: todayStart, lte: todayEnd } },
    include: { answers: true }
  });

  // Получаем таски, которые были обновлены или созданы сегодня
  const todaysTasks = await prisma.task.findMany({
    where: { updatedAt: { gte: todayStart, lte: todayEnd } },
    include: { project: true }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Итоги дня ({now.toLocaleDateString('ru-RU')})</h1>
      
      <div className="space-y-8">
        {activeUsers.map(user => {
          const checkIn = eveningCheckIns.find(c => c.userId === user.id);
          const userTasks = todaysTasks.filter(t => t.assigneeId === user.id || (t.assigneeId === null && t.createdById === user.id));

          // Если нет ни чекина, ни движения по таскам - пропускаем
          if (!checkIn && userTasks.length === 0) return null;

          return (
            <div key={user.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b px-4 py-3 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 text-lg">{user.name}</h3>
                {checkIn ? (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">✅ Чек-ин сдан</span>
                ) : (
                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">⏳ Только таски (без чек-ина)</span>
                )}
              </div>
              
              <div className="p-5 flex flex-col md:flex-row gap-6">
                
                {/* Левая колонка: Текст отчета */}
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Текст отчёта</h4>
                  {checkIn?.answers && checkIn.answers.length > 0 ? (
                    <div className="bg-gray-50 p-4 rounded border text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {checkIn.answers.map(a => a.value).join("\n\n")}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Свободный текст не отправлен.</p>
                  )}
                </div>

                {/* Правая колонка: Задачи за сегодня */}
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Задачи за сегодня</h4>
                  {userTasks.length > 0 ? (
                    <div className="space-y-2">
                      {userTasks.map(task => (
                        <div key={task.id} className="text-sm p-3 border rounded flex justify-between items-center bg-gray-50">
                          <div>
                            <div className="font-medium text-gray-900">{task.title}</div>
                            <div className="text-xs text-gray-500 mt-1">📁 {task.project?.name || "Без проекта"}</div>
                          </div>
                          <StatusSelect taskId={task.id} currentStatus={task.status} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Движений по задачам не было.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}