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
          className="w-full rounded-lg border border-[#ece6d8] bg-white px-4 py-2 text-sm text-[#1f1f1f] placeholder-[#b5aea0] outline-none focus:border-[#d4a24c]"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-[#8a8275]">Loading…</div>
      ) : highlights.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#8a8275]">
          {query ? '没有找到匹配的高亮' : '还没有任何高亮'}
        </div>
      ) : (
        <div className="divide-y divide-[#ece6d8]">
          {highlights.map((h) => (
            <a
              key={h.id}
              href={`/read/${h.article_id}#highlight-${h.id}`}
              className="block py-4 hover:bg-[#fbf7ec] -mx-4 px-4 rounded"
            >
              <div className="mb-1 text-xs text-[#8a8275]">
                {h.article_title || `Article ${h.article_id}`}
              </div>
              <div className="mb-1 border-l-2 border-[#d4a24c] pl-3 text-sm text-[#1f1f1f]">
                "{h.quoted_text}"
              </div>
              {h.note && (
                <div className="pl-3 text-xs italic text-[#8a8275]">
                  📝 {h.note}
                </div>
              )}
              <div className="mt-1 text-[10px] text-[#b5aea0]">
                {new Date(h.created_at).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
