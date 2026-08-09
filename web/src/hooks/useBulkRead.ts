'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { broadcast } from '@/lib/broadcast';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import type { ArticleItem } from '@/lib/types';
import { useReadStateCoordinator } from '@/components/providers/ReadStateProvider';
import type { ArticleStateSnapshot } from '@/lib/read-state-coordinator';
import { applyArticleStateChange, coordinatedReadStateChange } from '@/lib/article-state-cache';

type FeedArticleItem = ArticleItem & {
  is_starred?: boolean;
  is_read?: boolean;
};

interface BatchStateResponse {
  status: string;
  updated: number;
  article_ids: number[];
  states: ArticleStateSnapshot[];
}

interface BulkReadUndo {
  articleIds: number[];
  label: string;
}

const READ_DISMISS_DELAY_MS = 3000;

export function useBulkRead(items: FeedArticleItem[]) {
  const queryClient = useQueryClient();
  const readCoordinator = useReadStateCoordinator();
  const { t } = useI18n();
  const currentView = useUIStore((state) => state.currentView);
  const selectedSourceId = useUIStore((state) => state.selectedSourceId);

  const [pendingReadIds, setPendingReadIds] = useState<Set<number>>(() => new Set());
  const [bulkReadUndo, setBulkReadUndo] = useState<BulkReadUndo | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [openBulkConfirmScope, setOpenBulkConfirmScope] = useState<string | null>(null);
  const pendingReadTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const previousReadState = useRef(new Map<number, boolean>());
  const suppressPendingReadIds = useRef(new Set<number>());

  useEffect(() => {
    const timers = pendingReadTimers.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const clearPendingRead = useCallback((articleId: number) => {
    const timer = pendingReadTimers.current.get(articleId);
    if (timer) {
      clearTimeout(timer);
      pendingReadTimers.current.delete(articleId);
    }

    setPendingReadIds((previous) => {
      if (!previous.has(articleId)) return previous;
      const next = new Set(previous);
      next.delete(articleId);
      return next;
    });
  }, []);

  const schedulePendingRead = useCallback((articleId: number) => {
    const existingTimer = pendingReadTimers.current.get(articleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setPendingReadIds((previous) => {
      const next = new Set(previous);
      next.add(articleId);
      return next;
    });

    const timer = setTimeout(() => {
      pendingReadTimers.current.delete(articleId);
      setPendingReadIds((previous) => {
        if (!previous.has(articleId)) return previous;
        const next = new Set(previous);
        next.delete(articleId);
        return next;
      });
    }, READ_DISMISS_DELAY_MS);
    pendingReadTimers.current.set(articleId, timer);
  }, []);

  useEffect(() => {
    const previous = previousReadState.current;

    for (const item of items) {
      const wasRead = previous.get(item.id);
      const isRead = Boolean(item.is_read);

      if (wasRead === false && isRead && !suppressPendingReadIds.current.has(item.id)) {
        schedulePendingRead(item.id);
      } else if (wasRead === true && !isRead) {
        suppressPendingReadIds.current.delete(item.id);
        clearPendingRead(item.id);
      }
    }

    previousReadState.current = new Map(items.map((item) => [item.id, Boolean(item.is_read)]));
  }, [clearPendingRead, items, schedulePendingRead]);

  useEffect(() => {
    for (const item of items) {
      readCoordinator.seed({
        article_id: item.id,
        is_read: Boolean(item.is_read),
        is_starred: Boolean(item.is_starred),
        state_version: item.state_version,
      });
      const reconciliation = coordinatedReadStateChange(item, readCoordinator.get(item.id));
      if (reconciliation) applyArticleStateChange(queryClient, reconciliation);
    }
  }, [items, queryClient, readCoordinator]);

  const updateArticleReadState = useCallback(
    async (article: FeedArticleItem, nextRead: boolean) => {
      const previousRead = Boolean(article.is_read);
      if (previousRead === nextRead) return;

      if (nextRead) {
        schedulePendingRead(article.id);
      } else {
        clearPendingRead(article.id);
      }

      await readCoordinator.setDesired(article.id, nextRead);
    },
    [clearPendingRead, readCoordinator, schedulePendingRead],
  );

  const bulkScope = useMemo(() => {
    if (currentView === 'sources' && selectedSourceId) {
      return { scope: `source:${selectedSourceId}`, label: t('feed.bulkScopeCurrentSource') };
    }
    if (currentView === 'today') {
      return { scope: 'tab:today', label: t('feed.bulkScopeCurrentView') };
    }
    if (currentView === 'all') {
      return { scope: 'tab:stream', label: t('feed.bulkScopeCurrentView') };
    }
    return null;
  }, [currentView, selectedSourceId, t]);

  const syncBatchReadState = useCallback(
    (states: ArticleStateSnapshot[], isRead: boolean) => {
      for (const state of states) {
        const articleId = state.article_id;
        if (isRead) {
          suppressPendingReadIds.current.add(articleId);
        } else {
          suppressPendingReadIds.current.delete(articleId);
        }
        clearPendingRead(articleId);
        readCoordinator.applyRemote(state);
        broadcast({ type: 'state-change', articleId, is_read: state.is_read, is_starred: state.is_starred, state_version: state.state_version });
      }
    },
    [clearPendingRead, readCoordinator],
  );

  const handleBulkMarkRead = useCallback(async () => {
    if (!bulkScope || isBulkUpdating) return;

    setIsBulkUpdating(true);
    setOpenBulkConfirmScope(null);
    setBulkReadUndo(null);
    try {
      const result = await apiFetch<BatchStateResponse>('/api/articles/batch/state', {
        method: 'POST',
        body: JSON.stringify({ scope: bulkScope.scope, is_read: true }),
      });
      const articleIds = result.article_ids ?? [];
      syncBatchReadState(result.states ?? [], true);
      await queryClient.invalidateQueries({ queryKey: ['sources'] });

      if (articleIds.length > 0) {
        setBulkReadUndo({ articleIds, label: bulkScope.label });
      }
    } finally {
      setIsBulkUpdating(false);
    }
  }, [bulkScope, isBulkUpdating, queryClient, syncBatchReadState]);

  const handleUndoBulkMarkRead = useCallback(async () => {
    if (!bulkReadUndo || isBulkUpdating) return;

    const articleIds = bulkReadUndo.articleIds;
    setIsBulkUpdating(true);
    try {
      await Promise.all(articleIds.map((articleId) => readCoordinator.setDesired(articleId, false)));
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
      setBulkReadUndo(null);
    } finally {
      setIsBulkUpdating(false);
    }
  }, [bulkReadUndo, isBulkUpdating, queryClient, readCoordinator]);

  return {
    pendingReadIds,
    bulkReadUndo,
    isBulkUpdating,
    openBulkConfirmScope,
    setOpenBulkConfirmScope,
    bulkScope,
    updateArticleReadState,
    handleBulkMarkRead,
    handleUndoBulkMarkRead,
  };
}
