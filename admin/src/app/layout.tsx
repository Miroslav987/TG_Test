import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Добавили await перед cookies()
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  
  let userName = "";
  let isAdmin = false;
  
  if (sessionCookie) {
    try {
      const payload = decodeJwt(sessionCookie);
      userName = payload.name as string;
      isAdmin = payload.isAdmin === true; // Читаем статус админа
    } catch (e) {}
  }

  return (
    <html lang="ru">
      <body>
        {sessionCookie && (
          <header className="bg-white shadow-sm mb-8 border-b">
            <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center text-sm font-medium text-gray-600">
              <div className="font-bold text-gray-800">3.8</div>
              <div className="flex gap-6">
                {/* Обычный сотрудник видит только свои таски */}
                <Link href="/my-tasks" className="hover:text-blue-600">Мои таски</Link>
                
                {/* Админ видит всё остальное */}
                {isAdmin && (
                  <>
                    <Link href="/" className="hover:text-blue-600">Сотрудники</Link>
                    <Link href="/roles" className="hover:text-blue-600">Роли</Link>
                    <Link href="/questions" className="hover:text-blue-600">Вопросы</Link>
                    <Link href="/projects" className="hover:text-blue-600">Проекты</Link>
                    <Link href="/reports" className="hover:text-blue-600">Отчёты</Link>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4 border-l pl-4">
                <span className="text-gray-900 font-semibold">{userName}</span>
                <a href="/api/auth/logout" className="text-red-600 hover:underline">Выйти</a>
              </div>
            </div>
          </header>
        )}
        <main className={`max-w-5xl mx-auto px-4 ${sessionCookie ? 'pb-12' : ''}`}>
          {children}
        </main>
      </body>
    </html>
  );
}