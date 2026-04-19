import { apiFetch } from '@/lib/api-client';

export interface Highlight {
  id: number;
  article_id: number;
  layer: 'original' | 'translation';
  paragraph_index: number;
  text_start_offset: number;
  text_end_offset: number;
  quoted_text: string;
  note?: string;
  created_at: string;
}

export async function fetchHighlights(articleId: number): Promise<Highlight[]> {
  return apiFetch<Highlight[]>(`/api/articles/${articleId}/highlights`);
}

export async function createHighlight(params: {
  article_id: number;
  layer: string;
  paragraph_index: number;
  text_start_offset: number;
  text_end_offset: number;
  quoted_text: string;
  note?: string;
}): Promise<Highlight> {
  return apiFetch<Highlight>('/api/highlights', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateHighlightNote(id: number, note: string): Promise<void> {
  await apiFetch(`/api/highlights/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
}

export async function deleteHighlight(id: number): Promise<void> {
  await apiFetch(`/api/highlights/${id}`, { method: 'DELETE' });
}
