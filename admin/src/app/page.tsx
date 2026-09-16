import { prisma } from "@standup/shared";
import { createUser, toggleUserStatus, deleteUser } from "../actions/users";
import EditUser from "../components/EditUser";
import DeleteUserButton from "@/components/DeleteUserButton";

export default async function UsersPage() {
  // ДОБАВЛЕНО: _count для проверок истории
  const users = await prisma.user.findMany({ 
    include: { 
      roles: true, 
      _count: { select: { checkIns: true, tasks: true } } 
    }, 
    orderBy: { name: 'asc' } 
  });
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });

  const activeUsers = users.filter(u => u.isActive);
  const inactiveUsers = users.filter(u => !u.isActive);

  const UserCard = ({ user, isActive }: { user: any, isActive: boolean }) => {
    // Проверка: можно удалить, только если нет чекинов и тасок
    const canDelete = user._count.checkIns === 0 && user._count.tasks === 0;

    return (
      <div className={`border border-gray-200 bg-white p-5 rounded-lg shadow-sm ${!isActive ? 'opacity-60 grayscale' : ''}`}>
        <div className="flex justify-between items-start">
          <strong className="text-lg block">{user.name}</strong>
          {!isActive && <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Неактивен</span>}
        </div>
        <div className="text-sm text-gray-500 mt-2 mb-2">
          <div className="flex flex-wrap gap-1 mb-2">
            {user.roles.length > 0 ? (
              user.roles.map((r: any) => (
                <span key={r.id} className="bg-gray-100 px-2 py-1 rounded text-xs">{r.name}</span>
              ))
            ) : (
              <span className="bg-gray-100 px-2 py-1 rounded text-xs">Нет роли</span>
            )}
          </div>
          Таймзона: {user.timezone} | {user.workStart}-{user.workEnd}
        </div>
        
        <div className="flex gap-4 items-center mt-2 border-t pt-2">
          <EditUser user={user} roles={roles} />
          
          <form action={toggleUserStatus} className="inline mt-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="isActive" value={String(user.isActive)} />
            <button type="submit" className="text-xs text-orange-600 hover:underline">
              {isActive ? "🚫 Деактивировать" : "✅ Активировать"}
            </button>
          </form>

          {/* НОВАЯ КНОПКА УДАЛЕНИЯ */}
          {canDelete && (
            <DeleteUserButton userId={user.id} userName={user.name} />
          )}
        </div>
        
        {user.inviteToken && (
          <div className="mt-4 bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded text-sm">
            ⏳ Ожидает привязки Telegram.<br/>
            Отправь ссылку: <b className="select-all">t.me/ТВОЙ_БОТ_NAME?start={user.inviteToken}</b>
          </div>
        )}
        
        {user.telegramId && isActive && (
          <div className="mt-4 text-green-600 font-medium text-sm flex items-center gap-1">
            ✅ Telegram привязан
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Сотрудники</h1>
      
      <form action={createUser} className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-100 max-w-md">
        <h3 className="text-lg font-medium mb-4">Добавить сотрудника</h3>
        <input name="name" placeholder="Имя сотрудника" required className="w-full mb-3 p-2 border border-gray-300 rounded focus:outline-blue-500" />
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Роли</label>
          <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded max-h-40 overflow-y-auto">
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="roleIds" value={r.id} />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Создать</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeUsers.map(user => <UserCard key={user.id} user={user} isActive={true} />)}
      </div>

      {inactiveUsers.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4 text-gray-500 border-b pb-2">Уволенные / Неактивные</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inactiveUsers.map(user => <UserCard key={user.id} user={user} isActive={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}