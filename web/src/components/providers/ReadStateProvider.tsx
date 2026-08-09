'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange } from '@/lib/article-state-cache';
import { broadcast } from '@/lib/broadcast';
import { ReadStateCoordinator, type ArticleStateSnapshot } from '@/lib/read-state-coordinator';
import { useAuthStore } from '@/stores/useAuthStore';

const ReadStateContext = createContext<ReadStateCoordinator | null>(null);

export function ReadStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const ownerId = useAuthStore((state) => state.user?.id ?? null);
  const coordinator = useMemo(
    () => {
      // Reading state belongs to the active owner, so auth transitions get a
      // fresh coordinator even though the transport URLs are the same.
      void ownerId;
      return new ReadStateCoordinator({
        patch: (articleId, isRead) => apiFetch<ArticleStateSnapshot>(`/api/articles/${articleId}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: isRead }),
        }),
        get: (articleId) => apiFetch<ArticleStateSnapshot>(`/api/articles/${articleId}/state`),
      });
    },
    [ownerId],
  );

  useEffect(() => coordinator.subscribe((articleId, state) => {
    applyArticleStateChange(queryClient, {
      articleId,
      is_read: state.desired,
      state_version: state.serverVersion,
    });
  }), [coordinator, queryClient]);

  useEffect(() => coordinator.onAuthoritative((snapshot) => {
    applyArticleStateChange(queryClient, {
      articleId: snapshot.article_id,
      is_read: snapshot.is_read,
      is_starred: snapshot.is_starred,
      state_version: snapshot.state_version,
    });
    broadcast({
      type: 'state-change',
      articleId: snapshot.article_id,
      is_read: snapshot.is_read,
      is_starred: snapshot.is_starred,
      state_version: snapshot.state_version,
    });
  }), [coordinator, queryClient]);

  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void coordinator.retryUnsynced();
      }
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [coordinator]);

  return <ReadStateContext.Provider value={coordinator}>{children}</ReadStateContext.Provider>;
}

export function useReadStateCoordinator(): ReadStateCoordinator {
  const coordinator = useContext(ReadStateContext);
  if (!coordinator) throw new Error('useReadStateCoordinator must be used inside ReadStateProvider');
  return coordinator;
}

export function useReadSyncState(articleId: number | null) {
  const coordinator = useReadStateCoordinator();
  const subscribe = useCallback((notify: () => void) => coordinator.subscribe((changedArticleId) => {
    if (changedArticleId === articleId) notify();
  }), [articleId, coordinator]);
  const getSnapshot = useCallback(
    () => articleId == null ? undefined : coordinator.get(articleId),
    [articleId, coordinator],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
