import { NextResponse } from 'next/server';
import { mockArticleAI, mockArticles } from '@/app/api/_mock/data';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  const ai = mockArticleAI[numId];
  if (ai) {
    return NextResponse.json(ai);
  }
  const article = mockArticles.find((a) => a.id === numId);
  return NextResponse.json({
    title_translated: article?.title_translated,
    summary: article?.summary,
    body_translation_status: 'pending',
  });
}
