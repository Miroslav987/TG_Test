import { PrismaClient } from "@standup/shared";
// import { createUser } from "@/actions/users";

import { createUser } from "../../actions/users";

const prisma = new PrismaClient();

export default async function UsersPage() {
  const users = await prisma.user.findMany();

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Сотрудники</h1>
      
      <form action={createUser} style={{ marginBottom: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
        <h3>Добавить сотрудника</h3>
        <input 
          name="name" 
          placeholder="Имя сотрудника" 
          required 
          style={{ padding: '8px', marginRight: '10px' }}
        />
        <button type="submit" style={{ padding: '8px 16px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px' }}>
          Создать и получить ссылку
        </button>
      </form>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {users.map(user => (
          <div key={user.id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
            <strong>{user.name}</strong>
            <p style={{ fontSize: '14px', color: '#666' }}>Таймзона: {user.timezone} | Рабочие часы: {user.workStart}-{user.workEnd}</p>
            
            {user.inviteToken && (
              <div style={{ marginTop: '10px', background: '#e0f7fa', padding: '10px', borderRadius: '4px', fontSize: '14px' }}>
                ⏳ Ожидает привязки Telegram.<br/>
                Отправь сотруднику ссылку: <b>t.me/ТВОЙ_БОТ_NAME?start={user.inviteToken}</b>
              </div>
            )}
            
            {user.telegramId && (
              <div style={{ marginTop: '10px', color: 'green', fontWeight: 'bold' }}>
                ✅ Telegram привязан
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}