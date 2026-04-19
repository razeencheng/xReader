import { NextResponse } from 'next/server';
import { mockSources } from '@/app/api/_mock/data';

export async function GET() {
  return NextResponse.json(mockSources);
}

export async function POST(request: Request) {
  const body = await request.json();
  const newSource = {
    id: mockSources.length + 100,
    title: body.title || 'New Source',
    feed_url: body.feed_url,
    site_url: body.site_url || '',
    last_fetched_at: null,
    fail_count: 0,
  };
  return NextResponse.json(newSource, { status: 201 });
}
