import { prisma } from "@standup/shared";
import QuestionForm from "../../components/QuestionForm";

export default async function QuestionsPage() {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const questions = await prisma.question.findMany({
    include: { targetRole: true, targetUser: true },
    orderBy: { checkInTime: 'asc' }
  });

  const getTargetLabel = (q: any) => {
    if (q.targetRole) return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">Роль: {q.targetRole.name}</span>;
    if (q.targetUser) return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">Перс: {q.targetUser.name}</span>;
    return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Общий</span>;
  };

  const getTimeLabel = (time: string) => {
    switch (time) {
      case "MORNING": return "🌅 Утро";
      case "EVENING": return "🌆 Вечер";
      default: return "Утро и Вечер";
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Конструктор вопросов</h1>
      
      <QuestionForm roles={roles} users={users} />

      <h3 className="text-xl font-bold mb-4">Существующие вопросы</h3>
      <div className="space-y-3">
        {questions.length === 0 ? <p className="text-gray-500">Вопросов пока нет.</p> : null}
        
        {questions.map(q => (
          <div key={q.id} className="border border-gray-200 bg-white p-4 rounded-lg flex items-center justify-between">
            <div>
              <strong className="block mb-1">{q.text}</strong>
              <div className="flex gap-2 text-sm text-gray-500">
                <span>Тип: <b className="font-medium">{q.type}</b></span>
                {q.type === "SELECT" && <span className="text-xs">({q.options.join(", ")})</span>}
                <span>|</span>
                <span>Время: {getTimeLabel(q.checkInTime)}</span>
                <span>|</span>
                <span>{q.isRequired ? "Обязательный" : "Опциональный"}</span>
              </div>
            </div>
            <div>
              {getTargetLabel(q)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}