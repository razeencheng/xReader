import { NextResponse } from 'next/server';
import { mockUser } from '@/app/api/_mock/data';

export async function GET() {
  return NextResponse.json(mockUser);
}
