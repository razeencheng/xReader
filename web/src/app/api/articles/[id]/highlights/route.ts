import { NextResponse } from 'next/server';
import { mockHighlights } from '@/app/api/_mock/data';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  return NextResponse.json(mockHighlights.filter((h) => h.article_id === numId));
}
