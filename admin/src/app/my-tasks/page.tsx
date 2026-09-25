import { headers } from "next/headers";
import TaskListView from "../../components/TaskListView";

export default async function MyTasksPage() {
  const headersList = await headers(); // В Next 15+ headers() асинхронен
  const userId = headersList.get("x-user-id");

  if (!userId) {
    return <div>Ошибка авторизации. Пользователь не найден.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Мои задачи</h1>
      <TaskListView userId={userId} />
    </div>
  );
}