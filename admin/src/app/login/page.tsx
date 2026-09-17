"use client";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    // Динамически вставляем скрипт виджета, чтобы не ломать React
    if (!containerRef.current || containerRef.current.children.length > 0) return;
    
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", process.env.NEXT_PUBLIC_BOT_USERNAME || "");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", "/api/auth/telegram");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    
    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Вход в Админку</h1>
        <p className="text-gray-500 mb-8">Авторизуйтесь через привязанный Telegram-аккаунт.</p>
        
        {error === 'denied' && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 rounded text-sm">
            У вас нет прав администратора или аккаунт неактивен.
          </div>
        )}
        {error === 'invalid' && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 rounded text-sm">
            Ошибка авторизации (неверная подпись Telegram).
          </div>
        )}

        <div className="flex justify-center min-h-[40px]" ref={containerRef}>
          {/* Сюда Telegram вставит кнопку */}
        </div>
      </div>
    </div>
  );
}