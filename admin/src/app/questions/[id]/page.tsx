import { prisma } from "@standup/shared";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function QuestionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  // 1. ОПРЕДЕЛЯЕМ АУДИТОРИЮ (ЦЕЛЕВЫХ ПОЛЬЗОВАТЕЛЕЙ)
  let targetUsers: any[] = [];
  if (question.targetUserId) {
    targetUsers = await prisma.user.findMany({
      where: { id: question.targetUserId, isActive: true },
      orderBy: { name: 'asc' }
    });
  } else if (question.targetRoleId) {
    targetUsers = await prisma.user.findMany({
      where: { roles: { some: { id: question.targetRoleId } }, isActive: true },
      orderBy: { name: 'asc' }
    });
  } else {
    // Общий вопрос — для всех активных
    targetUsers = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
  }

  // 2. СОБИРАЕМ СТАТИСТИКУ (ДОСТАВКА И ПОСЛЕДНИЙ ОТВЕТ)
  const audienceStats = await Promise.all(targetUsers.map(async (user) => {
    const lastDelivery = await prisma.questionDelivery.findFirst({
      where: { questionId: question.id, userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    const lastAnswer = await prisma.answer.findFirst({
      where: { questionId: question.id, userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    return { user, lastDelivery, lastAnswer };
  }));

  return (
    <div>
      <div className="mb-6">
        <Link href="/questions" className="text-blue-600 hover:underline">← Назад к вопросам</Link>
      </div>
      
      <h1 className="text-2xl font-bold mb-6 text-gray-900">{question.text}</h1>
      
      {/* ТАБЛИЦА: ИСТОРИЯ ОТВЕТОВ */}
      <h2 className="text-xl font-bold mb-4 text-gray-900">Лента ответов</h2>
      {question.answers.length === 0 ? (
        <p className="text-gray-500 bg-white p-6 rounded-lg border mb-12">Пока никто не ответил на этот вопрос.</p>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden mb-12">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-medium text-gray-700 w-1/4">Дата</th>
                <th className="p-4 font-medium text-gray-700 w-1/4">Сотрудник</th>
                <th className="p-4 font-medium text-gray-700 w-1/2">Ответ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {question.answers.map(answer => {
                const dateVal = answer.createdAt || answer.checkIn?.createdAt || new Date();
                const formattedDate = new Date(dateVal).toLocaleString("ru-RU", { 
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                });
                
                const userName = answer.user?.name || answer.checkIn?.user?.name || "Неизвестно";
                
                return (
                  <tr key={answer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm text-gray-500 whitespace-nowrap align-top">{formattedDate}</td>
                    <td className="p-4 text-sm font-medium text-gray-900 align-top">{userName}</td>
                    <td className="p-4 text-sm text-gray-800 whitespace-pre-wrap align-top">{answer.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ТАБЛИЦА: КОМУ ОТПРАВЛЕНО */}
      <h2 className="text-xl font-bold mb-4 text-gray-900">Аудитория опроса (Кому назначено)</h2>
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden mb-8">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-medium text-gray-700 w-1/4">Имя сотрудника</th>
              <th className="p-4 font-medium text-gray-700 w-1/4">Последняя отправка</th>
              <th className="p-4 font-medium text-gray-700 w-1/2">Последний ответ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {audienceStats.map(stat => {
              const deliveryDate = stat.lastDelivery 
                ? new Date(stat.lastDelivery.createdAt).toLocaleString("ru-RU", { 
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                : "ещё не отправлялся";
                
              const answerDate = stat.lastAnswer
                ? new Date(stat.lastAnswer.createdAt).toLocaleString("ru-RU", { 
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                : null;
                
              const answerText = stat.lastAnswer 
                ? `${answerDate} — ${stat.lastAnswer.value.length > 50 ? stat.lastAnswer.value.substring(0, 50) + '...' : stat.lastAnswer.value}`
                : "нет ответа";

              return (
                <tr key={stat.user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm font-medium text-gray-900 align-top">{stat.user.name}</td>
                  <td className="p-4 text-sm text-gray-500 align-top">{deliveryDate}</td>
                  <td className="p-4 text-sm text-gray-800 align-top">{answerText}</td>
                </tr>
              );
            })}
            
            {audienceStats.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-sm text-gray-500 text-center">
                  Нет активных пользователей, подходящих под критерии.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}