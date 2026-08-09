'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useReadStateCoordinator } from '@/components/providers/ReadStateProvider';
import type { ArticleStateSnapshot } from '@/lib/read-state-coordinator';

interface ArticleChangeResponse {
  items: ArticleStateSnapshot[];
  next_cursor: string;
  has_more: boolean;
}

const POLL_INTERVAL_MS = 30_000;

export function useCrossDevicePoll(enabled = true) {
  const queryClient = useQueryClient();
  const coordinator = useReadStateCoordinator();
  const cursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    cursorRef.current = null;
    inFlightRef.current = false;
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible' || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      try {
        let response = await apiFetch<ArticleChangeResponse>(
          cursorRef.current
            ? `/api/articles/changes?cursor=${encodeURIComponent(cursorRef.current)}`
            : '/api/articles/changes',
        );
        if (cancelled) return;
        if (cursorRef.current === null) {
          cursorRef.current = response.next_cursor;
          await queryClient.invalidateQueries({ queryKey: ['articles'] });
          return;
        }
        do {
          for (const item of response.items ?? []) coordinator.applyRemote(item);
          cursorRef.current = response.next_cursor;
          if (!response.has_more) break;
          response = await apiFetch<ArticleChangeResponse>(
            `/api/articles/changes?cursor=${encodeURIComponent(cursorRef.current)}`,
          );
        } while (!cancelled);
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
  }, [coordinator, enabled, queryClient]);
}
