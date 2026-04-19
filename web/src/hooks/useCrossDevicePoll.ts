import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface ArticleChange {
  article_id: number;
  changed_at: string;
}

export function useCrossDevicePoll(enabled = true) {
  const queryClient = useQueryClient();
  const lastPollRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const changes = await apiFetch<ArticleChange[]>(
          `/api/articles/changes?since=${encodeURIComponent(lastPollRef.current)}`,
        );
        if (changes && changes.length > 0) {
          lastPollRef.current = new Date().toISOString();
          queryClient.invalidateQueries({ queryKey: ['articles'] });
        }
      } catch {}
    };

    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [enabled, queryClient]);
}
