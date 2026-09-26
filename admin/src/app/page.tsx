import { prisma } from "@standup/shared";
import { createUser, toggleUserStatus, toggleAdmin } from "../actions/users";
import EditUser from "../components/EditUser";
import DeleteUserButton from "../components/DeleteUserButton";
import Link from "next/link";

export default async function UsersPage() {
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {activeUsers.map(user => <UserCard key={user.id} user={user} roles={roles} isActive={true} />)}
      </div>

      {inactiveUsers.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4 text-gray-500 border-b pb-2">Уволенные / Неактивные</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {inactiveUsers.map(user => <UserCard key={user.id} user={user} roles={roles} isActive={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function UserCard({ user, roles, isActive }: { user: any, roles: any[], isActive: boolean }) {
  const canDelete = user._count.checkIns === 0 && user._count.tasks === 0;

  const safeUserForClient = {
    id: user.id,
    name: user.name,
    roles: user.roles,
    timezone: user.timezone,
    workStart: user.workStart,
    workEnd: user.workEnd,
    workDays: user.workDays
  };

  return (
    <div className={`border border-gray-200 bg-white p-5 rounded-lg shadow-sm flex flex-col justify-between ${!isActive ? 'opacity-60 grayscale' : ''}`}>
      <div>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <strong className="text-lg block">{user.name}</strong>
            {user.isAdmin && <span className="bg-purple-100 text-purple-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Admin</span>}
          </div>
          {!isActive && <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Неактивен</span>}
        </div>
        <div className="text-sm text-gray-500 mt-2 mb-2">
          <div className="flex flex-wrap gap-1 mb-2">
            {user.roles && user.roles.length > 0 ? (
              user.roles.map((r: any) => (
                <span key={r.id} className="bg-gray-100 px-2 py-1 rounded text-xs">{r.name}</span>
              ))
            ) : (
              <span className="bg-gray-100 px-2 py-1 rounded text-xs">Нет роли</span>
            )}
          </div>
          Таймзона: {user.timezone} | {user.workStart}-{user.workEnd}
        </div>
      </div>
      
      <div className="flex gap-4 items-center mt-2 border-t pt-2 flex-wrap">
        <Link href={`/users/${user.id}/tasks`} className="text-xs font-medium text-blue-600 hover:underline mt-2">
          📋 Задачи
        </Link>
        
        <EditUser user={safeUserForClient} roles={roles} />
        
        <form action={toggleUserStatus} className="inline mt-2">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="isActive" value={String(user.isActive)} />
          <button type="submit" className="text-xs text-orange-600 hover:underline">
            {isActive ? "🚫 Деактивировать" : "✅ Активировать"}
          </button>
        </form>

        <form action={toggleAdmin} className="inline mt-2">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="isAdmin" value={String(user.isAdmin)} />
          <button type="submit" className="text-xs text-purple-600 hover:underline">
            {user.isAdmin ? "⬇️ Забрать права" : "⬆️ Сделать админом"}
          </button>
        </form>

        {canDelete && <DeleteUserButton userId={user.id} userName={user.name} />}
      </div>
      
      {user.inviteToken && (
        <div className="mt-4 bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded text-sm">
          ⏳ Ожидает привязки Telegram.<br/>
          Отправь ссылку: <b className="select-all">t.me/{process.env.NEXT_PUBLIC_BOT_USERNAME}?start={user.inviteToken}</b>
        </div>
      )}
      
      {user.telegramId && isActive && (
        <div className="mt-4 text-green-600 font-medium text-sm flex items-center gap-1">
          ✅ Telegram привязан
        </div>
      )}
    </div>
  );
}