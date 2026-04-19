import { mockArticleStates } from '@/app/api/_mock/data';

export { PATCH as PUT };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  const body = await request.json();
  if (mockArticleStates[numId]) {
    Object.assign(mockArticleStates[numId], body);
  }
  return new Response(null, { status: 204 });
}
