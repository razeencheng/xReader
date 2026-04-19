import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { mockArticles, mockArticleStates } from '@/app/api/_mock/data';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tab = searchParams.get('tab') || 'stream';
  const cursor = searchParams.get('cursor');
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  let items = mockArticles.map((a) => ({
    ...a,
    ...mockArticleStates[a.id],
  }));

  if (tab === 'today') {
    const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    items = items.filter((a) => a.published_at && a.published_at > oneDayAgo);
  } else if (tab === 'starred') {
    items = items.filter((a) => a.is_starred);
  }

  let startIndex = 0;
  if (cursor) {
    const cursorId = parseInt(cursor, 10);
    startIndex = items.findIndex((a) => a.id === cursorId) + 1;
  }

  const page = items.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < items.length ? String(items[startIndex + limit]?.id) : undefined;

  return NextResponse.json({ items: page, next_cursor: nextCursor ?? null });
}
