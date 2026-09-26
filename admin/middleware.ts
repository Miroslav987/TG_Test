import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get('session')?.value;
  const baseUrl = process.env.APP_URL || request.url;

  const isLoginPage = pathname === '/login';

  // 1. Если сессии нет и пользователь пытается зайти на защищённую страницу
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  if (session) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      const { payload } = await jwtVerify(session, secret);
      
      const isAdminUser = payload.isAdmin === true;

      // 2. ОГРАНИЧЕНИЕ ПРАВ ДОСТУПА ДЛЯ НЕ-АДМИНОВ
      if (!isAdminUser && pathname !== '/my-tasks') {
        return NextResponse.redirect(new URL('/my-tasks', baseUrl));
      }

      // 3. Если пользователь УЖЕ залогинен и пытается открыть /login -> отправляем на нужную страницу
      if (isLoginPage) {
        const redirectUrl = isAdminUser ? '/' : '/my-tasks';
        return NextResponse.redirect(new URL(redirectUrl, baseUrl));
      }

      // 4. Прокидываем данные пользователя в заголовки запроса
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', payload.sub as string);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      // Если токен невалиден / истёк
      const response = NextResponse.redirect(new URL('/login', baseUrl));
      response.cookies.delete('session');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};