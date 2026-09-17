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

      // 2. Если пользователь УЖЕ залогинен и пытается открыть /login -> отправляем на главную
      if (isLoginPage) {
        return NextResponse.redirect(new URL('/', request.url));
      }

      // 3. Прокидываем данные пользователя в заголовки запроса
      const requestHeaders = new Headers(request.headers);
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