import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value;

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(session, secret); // Извлекаем payload
    
    // ИЗМЕНЕНО: Ограничение доступа для не-админов
    const isAdminUser = payload.isAdmin === true;
    const pathname = request.nextUrl.pathname;

    if (!isAdminUser && pathname !== '/my-tasks') {
      return NextResponse.redirect(new URL('/my-tasks', request.url));
    }

    // Прокидываем userId в headers для использования в серверных компонентах
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      }
    });
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session');
    return response;
  }
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};