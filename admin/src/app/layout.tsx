import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="bg-white shadow-sm mb-8 border-b">
          <div className="max-w-5xl mx-auto px-4 py-4 flex gap-6 text-sm font-medium text-gray-600">
            <Link href="/users" className="hover:text-blue-600">Сотрудники</Link>
            <Link href="/roles" className="hover:text-blue-600">Роли</Link>
            <Link href="/questions" className="hover:text-blue-600">Вопросы</Link>
            <Link href="/projects" className="hover:text-blue-600">Проекты</Link>
            <Link href="/reports" className="hover:text-blue-600">Отчёты</Link>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}