import { prisma } from "@standup/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import TaskListView from "../../../../components/TaskListView";

export default async function UserTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true }
  });

  if (!user) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:underline">← Назад к сотрудникам</Link>
      </div>
      
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Задачи: {user.name}</h1>
      
      <TaskListView userId={id} />
    </div>
  );
}