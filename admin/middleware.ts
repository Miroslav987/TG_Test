import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get('session')?.value;

  const isLoginPage = pathname === '/login';

  // 1. Если сессии нет и пользователь пытается зайти на защищённую страницу
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      const { payload } = await jwtVerify(session, secret);
      
      const isAdminUser = payload.isAdmin === true;

      // 2. ОГРАНИЧЕНИЕ ПРАВ ДОСТУПА ДЛЯ НЕ-АДМИНОВ
      // Если это не админ, и он пытается открыть любой URL кроме своих задач
      if (!isAdminUser && pathname !== '/my-tasks') {
        return NextResponse.redirect(new URL('/my-tasks', request.url));
      }

      // 3. Если пользователь УЖЕ залогинен и пытается открыть /login -> отправляем на нужную страницу
      if (isLoginPage) {
        // Админа отправляем на главную, обычного юзера - в его таски
        const redirectUrl = isAdminUser ? '/' : '/my-tasks';
        return NextResponse.redirect(new URL(redirectUrl, request.url));
      }

      // 4. Прокидываем данные пользователя в заголовки запроса
      const requestHeaders = new Headers(request.headers);
      // Берём payload.sub (он надёжнее, так как мы сетили его через setSubject(user.id))
      requestHeaders.set('x-user-id', payload.sub as string);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      // Если токен невалиден / истёк
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('session');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  // Защищаем всё, КРОМЕ /api/auth/* и статики Next.js (/login теперь обрабатывается внутри middleware)
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};