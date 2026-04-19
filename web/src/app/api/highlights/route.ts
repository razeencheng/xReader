import { NextResponse } from 'next/server';
import { mockHighlightRows, mockHighlights } from '@/app/api/_mock/data';

export async function GET() {
  return NextResponse.json(mockHighlightRows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const newHighlight = {
    id: mockHighlights.length + 100,
    ...body,
    created_at: new Date().toISOString(),
  };
  return NextResponse.json(newHighlight, { status: 201 });
}
