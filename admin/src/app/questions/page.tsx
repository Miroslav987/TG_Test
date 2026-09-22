import { prisma } from "@standup/shared";
import QuestionForm from "../../components/QuestionForm";
import QuestionItem from "../../components/QuestionItem";

export default async function QuestionsPage() {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  
  // ДОБАВЛЕНО: include deliveries (берем 1 самую старую, чтобы знать, отправлялся ли вопрос)
  const questions = await prisma.question.findMany({
    include: { 
      targetRole: true, 
      targetUser: true,
      deliveries: { orderBy: { createdAt: 'asc' }, take: 1 } 
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Конструктор вопросов</h1>
      
      <QuestionForm roles={roles} users={users} />

      <h3 className="text-xl font-bold mb-4">Существующие вопросы</h3>
      <div>
        {questions.length === 0 ? <p className="text-gray-500">Вопросов пока нет.</p> : null}
        
        {questions.map(q => (
          <QuestionItem key={q.id} q={q} roles={roles} users={users} />
        ))}
      </div>
    </div>
  );
}