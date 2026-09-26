import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@standup/shared';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url); // Оставляем для чтения параметров
  const searchParams = url.searchParams;
  const baseUrl = process.env.APP_URL || request.url;

  const hash = searchParams.get('hash');
  if (!hash) return NextResponse.redirect(new URL('/login?error=invalid', baseUrl));

  const keys = Array.from(searchParams.keys()).filter(k => k !== 'hash').sort();
  const dataCheckString = keys.map(k => `${k}=${searchParams.get(k)}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const authDate = Number(searchParams.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  
  if (hmac !== hash || (now - authDate) > 86400) {
    return NextResponse.redirect(new URL('/login?error=invalid', baseUrl));
  }

  const telegramId = searchParams.get('id');
  if (!telegramId) return NextResponse.redirect(new URL('/login?error=invalid', baseUrl));

  const user = await prisma.user.findFirst({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL('/login?error=denied', baseUrl));
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ 
    userId: user.id, 
    name: user.name, 
    isAdmin: user.isAdmin
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('30d')
    .sign(secret);

  const response = NextResponse.redirect(new URL('/', baseUrl));
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}