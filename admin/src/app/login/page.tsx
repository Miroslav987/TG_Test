"use client";
import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

console.log(1);

  useEffect(() => {
    console.log("[DEBUG] эффект запустился, containerRef.current =", containerRef.current);
    console.log("[DEBUG] NEXT_PUBLIC_BOT_USERNAME =", JSON.stringify(process.env.NEXT_PUBLIC_BOT_USERNAME));

    if (!containerRef.current) {
      console.log("[DEBUG] контейнера нет, выходим");
      return;
    }
    if (containerRef.current.children.length > 0) {
      console.log("[DEBUG] в контейнере уже что-то есть, выходим:", containerRef.current.innerHTML);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", process.env.NEXT_PUBLIC_BOT_USERNAME || "");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", "/api/auth/telegram");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    script.onload = () => console.log("[DEBUG] telegram-widget.js ЗАГРУЗИЛСЯ УСПЕШНО");
    script.onerror = (e) => console.log("[DEBUG] telegram-widget.js ОШИБКА ЗАГРУЗКИ", e);

    containerRef.current.appendChild(script);
    console.log("[DEBUG] script добавлен в DOM, содержимое контейнера:", containerRef.current.innerHTML);
  }, []);

  return (
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

      <div className="flex justify-center min-h-[40px]" ref={containerRef} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<div className="text-gray-400">Загрузка...</div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}