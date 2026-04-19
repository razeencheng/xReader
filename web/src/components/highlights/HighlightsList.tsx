'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface HighlightRow {
  id: number;
  article_id: number;
  quoted_text: string;
  note?: string;
  paragraph_index: number;
  created_at: string;
  article_title?: string;
  article_link?: string;
}

export function HighlightsList() {
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', '50');

    setIsLoading(true);
    apiFetch<HighlightRow[]>(`/api/highlights?${params}`)
      .then(setHighlights)
      .catch(() => setHighlights([]))
      .finally(() => setIsLoading(false));
  }, [query]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索高亮和笔记…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-4 py-2 text-sm text-[var(--text-body)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--border-accent)]"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
      ) : highlights.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          {query ? '没有找到匹配的高亮' : '还没有任何高亮'}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-default)]">
          {highlights.map((h) => (
            <a
              key={h.id}
              href={`/read/${h.article_id}#highlight-${h.id}`}
              className="block py-4 hover:bg-[var(--bg-badge-starred)] -mx-4 px-4 rounded"
            >
              <div className="mb-1 text-xs text-[var(--text-muted)]">
                {h.article_title || `Article ${h.article_id}`}
              </div>
              <div className="mb-1 border-l-2 border-[var(--border-accent)] pl-3 text-sm text-[var(--text-body)]">
                "{h.quoted_text}"
              </div>
              {h.note && (
                <div className="pl-3 text-xs italic text-[var(--text-muted)]">
                  📝 {h.note}
                </div>
              )}
              <div className="mt-1 text-[10px] text-[var(--text-faint)]">
                {new Date(h.created_at).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
