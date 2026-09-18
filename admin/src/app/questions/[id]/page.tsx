import { prisma } from "@standup/shared";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function QuestionHistoryPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;

  if (!id) notFound();

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      answers: {
        include: {
          user: { select: { name: true } },
          checkIn: { include: { user: { select: { name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!question) notFound();

  // Группировка ответов по дате и пользователю
  type AnswerType = (typeof question.answers)[number];
  
  const groupedAnswers = question.answers.reduce((acc, answer) => {
    const dateObj = new Date(answer.createdAt || answer.checkIn?.createdAt || new Date());
    
    // Ключ даты для группировки (например, "17 сентября 2026")
    const dateKey = dateObj.toLocaleDateString("ru-RU", { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
    
    const userName = answer.user?.name || answer.checkIn?.user?.name || "Неизвестно";
    const groupKey = `${dateKey}_${userName}`;

    if (!acc[groupKey]) {
      acc[groupKey] = {
        dateStr: dateKey,
        userName,
        items: []
      };
    }

    acc[groupKey].items.push({
      ...answer,
      timeStr: dateObj.toLocaleTimeString("ru-RU", { hour: '2-digit', minute: '2-digit' })
    });

    return acc;
  }, {} as Record<string, { dateStr: string; userName: string; items: (AnswerType & { timeStr: string })[] }>);

  const groups = Object.values(groupedAnswers);

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="mb-6">
        <Link href="/questions" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
          ← Назад к вопросам
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold mb-8 text-gray-900 tracking-tight">{question.text}</h1>
      
      {groups.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500 shadow-sm">
          Пока никто не ответил на этот вопрос.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
              {/* Шапка карточки дня */}
              <div className="bg-gray-50/80 px-6 py-3.5 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{group.dateStr}</span>
                  <span className="text-xs bg-gray-200 text-gray-700 px-2.5 py-0.5 rounded-full font-medium">
                    {group.items.length} {group.items.length === 1 ? 'ответ' : 'ответа'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Сотрудник:</span>
                  <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                    {group.userName}
                  </span>
                </div>
              </div>

              {/* Список ответов за этот день */}
              <div className="divide-y divide-gray-100 px-6">
                {group.items.map((item) => (
                  <div key={item.id} className="py-4 flex gap-4 items-start group/item">
                    <span className="text-xs font-mono font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded mt-0.5 select-none">
                      {item.timeStr}
                    </span>
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap flex-1 pt-0.5">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}