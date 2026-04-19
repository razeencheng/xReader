import { NextResponse } from 'next/server';
import { mockUser } from '@/app/api/_mock/data';

export async function GET() {
  return NextResponse.json({
    native_language: mockUser.native_language,
    density_pref: mockUser.density_pref,
    theme_pref: mockUser.theme_pref,
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  Object.assign(mockUser, body);
  return new Response(null, { status: 204 });
}
