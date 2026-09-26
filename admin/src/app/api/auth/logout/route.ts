import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const baseUrl = process.env.APP_URL || request.url;
  const response = NextResponse.redirect(new URL('/login', baseUrl));
  response.cookies.delete('session');
  return response;
}