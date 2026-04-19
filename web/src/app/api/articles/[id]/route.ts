import { NextResponse } from 'next/server';
import { mockArticles, mockArticleDetail, mockArticleStates } from '@/app/api/_mock/data';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (numId === mockArticleDetail.id) {
    return NextResponse.json({ ...mockArticleDetail, ...mockArticleStates[numId] });
  }

  const article = mockArticles.find((a) => a.id === numId);
  if (!article) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...article,
    ...mockArticleStates[numId],
    content_html: '<p>Full article content not available in mock.</p>',
    content_text: 'Full article content not available in mock.',
  });
}
