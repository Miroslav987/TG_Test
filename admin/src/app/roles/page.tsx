import { prisma } from "@standup/shared";
import { createRole } from "../../actions/roles";

export default async function RolesPage() {
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } } });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Роли</h1>
      
      <form action={createRole} className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-100 max-w-md">
        <h3 className="text-lg font-medium mb-4">Добавить роль</h3>
        <input 
          name="name" 
          placeholder="Название (например: developer, sales)" 
          required 
          className="w-full mb-4 p-2 border border-gray-300 rounded focus:outline-blue-500"
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          Создать роль
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="border border-gray-200 bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
            <span className="font-semibold">{role.name}</span>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              Сотрудников: {role._count.users}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}