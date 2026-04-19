'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange, type ArticleStateChange } from '@/lib/article-state-cache';
import { consumeLocalBroadcast } from '@/lib/broadcast';

interface ArticleChangeResponse {
  items: Array<ArticleStateChange & { changed_at: string }>;
}

const POLL_INTERVAL_MS = 30_000;

function laterTimestamp(left: string, right: string) {
  return left > right ? left : right;
}

export function useCrossDevicePoll(enabled = true) {
  const queryClient = useQueryClient();
  const sinceRef = useRef<string>(new Date(0).toISOString());
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible' || inFlightRef.current) {
        return;
      }

      const pollStartedAt = new Date().toISOString();
      const pollSince = sinceRef.current;
      inFlightRef.current = true;

      try {
        const response = await apiFetch<ArticleChangeResponse>(
          `/api/articles/changes?since=${encodeURIComponent(pollSince)}`,
        );

        if (cancelled) {
          return;
        }

        let newestChangeAt = pollStartedAt;
        for (const change of response.items ?? []) {
          newestChangeAt = laterTimestamp(newestChangeAt, change.changed_at);

          if (consumeLocalBroadcast(change)) {
            continue;
          }

          applyArticleStateChange(queryClient, change);
        }

        sinceRef.current = newestChangeAt;
      } catch {
        // Ignore transient polling failures.
      } finally {
        inFlightRef.current = false;
      }
    };

    void poll();

    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, queryClient]);
}
