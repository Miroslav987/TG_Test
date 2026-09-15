import { prisma } from "@standup/shared";
import { createUser } from "../actions/users";
import EditSchedule from "../components/EditSchedule";

export default async function UsersPage() {
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: { name: 'asc' } });
  const roles = await prisma.role.findMany();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Сотрудники</h1>
      
      <form action={createUser} className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-100 max-w-md">
        <h3 className="text-lg font-medium mb-4">Добавить сотрудника</h3>
        <input name="name" placeholder="Имя сотрудника" required className="w-full mb-3 p-2 border border-gray-300 rounded focus:outline-blue-500" />
        <select name="roleId" className="w-full mb-4 p-2 border border-gray-300 rounded focus:outline-blue-500">
          <option value="">-- Без роли --</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          Создать и получить ссылку
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map(user => (
          <div key={user.id} className="border border-gray-200 bg-white p-5 rounded-lg shadow-sm">
            <strong className="text-lg block">{user.name}</strong>
            <div className="text-sm text-gray-500 mt-1">
              <span className="bg-gray-100 px-2 py-1 rounded text-xs mr-2">{user.role?.name || "Нет роли"}</span>
              Таймзона: {user.timezone} | {user.workStart}-{user.workEnd}
            </div>
            
            {/* Клиентский компонент для редактирования */}
            <EditSchedule user={user} />
            
            {user.inviteToken && (
              <div className="mt-4 bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded text-sm">
                ⏳ Ожидает привязки Telegram.<br/>
                Отправь ссылку: <b className="select-all">t.me/espada_it_solutions_bot?start={user.inviteToken}</b>
              </div>
            )}
            
            {user.telegramId && (
              <div className="mt-4 text-green-600 font-medium text-sm flex items-center gap-1">
                ✅ Telegram привязан
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}