import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@standup/shared';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const hash = searchParams.get('hash');
  if (!hash) return NextResponse.redirect(new URL('/login?error=invalid', request.url));

  const keys = Array.from(searchParams.keys()).filter(k => k !== 'hash').sort();
  const dataCheckString = keys.map(k => `${k}=${searchParams.get(k)}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const authDate = Number(searchParams.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  
  if (hmac !== hash || (now - authDate) > 86400) {
    return NextResponse.redirect(new URL('/login?error=invalid', request.url));
  }

  const telegramId = searchParams.get('id');
  if (!telegramId) return NextResponse.redirect(new URL('/login?error=invalid', request.url));

  const user = await prisma.user.findFirst({
    where: { telegramId: BigInt(telegramId) }
  });

  // ИЗМЕНЕНО: пускаем любого активного сотрудника
  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL('/login?error=denied', request.url));
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ 
    userId: user.id, 
    name: user.name, 
    isAdmin: user.isAdmin // <-- ДОБАВЛЕНО В PAYLOAD
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('30d')
    .sign(secret);

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}