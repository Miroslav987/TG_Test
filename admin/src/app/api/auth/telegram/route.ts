import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@standup/shared';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const hash = searchParams.get('hash');
  if (!hash) return NextResponse.redirect(`${baseUrl}/login?error=invalid`);

  // 1. Собираем строку для проверки (сортировка по алфавиту)
  const keys = Array.from(searchParams.keys()).filter(k => k !== 'hash').sort();
  const dataCheckString = keys.map(k => `${k}=${searchParams.get(k)}`).join('\n');

  // 2. Создаем секретный ключ из токена бота
  const secretKey = crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest();
  
  // 3. Вычисляем HMAC-SHA256
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // 4. Проверяем подпись и дату (не старше 24 часов)
  const authDate = Number(searchParams.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  
  if (hmac !== hash || (now - authDate) > 86400) {
    return NextResponse.redirect(`${baseUrl}/login?error=invalid`);
  }

  // 5. Ищем пользователя в БД
  const telegramId = searchParams.get('id');
  if (!telegramId) return NextResponse.redirect(`${baseUrl}/login?error=invalid`);

  const user = await prisma.user.findFirst({
    where: { telegramId: BigInt(telegramId) }
  });

  // Проверяем права доступа
  if (!user || !user.isActive || !user.isAdmin) {
    return NextResponse.redirect(`${baseUrl}/login?error=denied`);
  }

  // 6. Подписываем JWT
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ userId: user.id, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('30d')
    .sign(secret);

  // 7. Ставим cookie и пускаем в систему
  const response = NextResponse.redirect(`${baseUrl}/`);
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 дней
    path: '/',
  });

  return response;
}
