import { NextResponse } from 'next/server';
import { mockAllowlist } from '@/app/api/_mock/data';

export async function GET() {
  return NextResponse.json(mockAllowlist);
}

export async function POST(request: Request) {
  const body = await request.json();
  const entry = {
    github_username: body.github_username,
    role: body.role || 'user',
    created_at: new Date().toISOString(),
  };
  mockAllowlist.push(entry);
  return NextResponse.json(entry, { status: 201 });
}
