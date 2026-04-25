'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { ChevronLeft } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange } from '@/lib/article-state-cache';
import { broadcast } from '@/lib/broadcast';
import { useI18n } from '@/lib/i18n';
import { useArticles } from '@/lib/queries/articles';
import { useUIStore, type ReadFilter } from '@/stores/useUIStore';
import { FeedRowComfortable } from './FeedRowComfortable';
import { FeedRowCompact } from './FeedRowCompact';
import { FeedSkeleton, CompactSkeleton } from './FeedSkeleton';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem, ArticleTab, Source } from '@/lib/types';

type FeedArticleItem = ArticleItem & {
  is_starred?: boolean;
  is_read?: boolean;
};

interface BatchStateResponse {
  status: string;
  updated: number;
  article_ids: number[];
}

interface BulkReadUndo {
  articleIds: number[];
  label: string;
}

const READ_FILTERS: Array<{ id: ReadFilter; labelKey: string }> = [
  { id: 'unread', labelKey: 'feed.unread' },
  { id: 'all', labelKey: 'feed.all' },
  { id: 'read', labelKey: 'feed.read' },
];

const READ_DISMISS_DELAY_MS = 3000;

interface FeedListProps {
  onOpenArticle?: (article: ArticleItem) => void;
  selectedArticleId?: number | null;
}

export function FeedList({ onOpenArticle, selectedArticleId = null }: FeedListProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const currentView = useUIStore((state) => state.currentView);
  const selectedSourceId = useUIStore((state) => state.selectedSourceId);
  const density = useUIStore((state) => state.density);
  const readFilter = useUIStore((state) => state.readFilter);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const setReadFilter = useUIStore((state) => state.setReadFilter);

  const tab: ArticleTab = currentView === 'starred' ? 'starred' : currentView === 'today' ? 'today' : 'stream';

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useArticles(
    tab,
    currentView === 'sources' ? selectedSourceId : null,
  );

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: () => apiFetch<Source[]>('/api/sources'),
    enabled: currentView === 'sources' && selectedSourceId !== null,
  });

  const { ref, inView } = useInView({ rootMargin: '200px 0px' });
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingReadIds, setPendingReadIds] = useState<Set<number>>(() => new Set());
  const [bulkReadUndo, setBulkReadUndo] = useState<BulkReadUndo | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [openBulkConfirmScope, setOpenBulkConfirmScope] = useState<string | null>(null);
  const pendingReadTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const previousReadState = useRef(new Map<number, boolean>());
  const suppressPendingReadIds = useRef(new Set<number>());

  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

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
    const timers = pendingReadTimers.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
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

  const updateArticleReadState = useCallback(
    async (article: FeedArticleItem, nextRead: boolean) => {
      const previousRead = Boolean(article.is_read);
      if (previousRead === nextRead) return;

      if (nextRead) {
        schedulePendingRead(article.id);
      } else {
        clearPendingRead(article.id);
      }

      applyArticleStateChange(queryClient, { articleId: article.id, is_read: nextRead });

      try {
        await apiFetch(`/api/articles/${article.id}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: nextRead }),
        });
        broadcast({ type: 'state-change', articleId: article.id, is_read: nextRead });
      } catch {
        applyArticleStateChange(queryClient, { articleId: article.id, is_read: previousRead });
        if (previousRead) {
          schedulePendingRead(article.id);
        } else {
          clearPendingRead(article.id);
        }
      }
    },
    [clearPendingRead, queryClient, schedulePendingRead],
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
    (articleIds: number[], isRead: boolean) => {
      for (const articleId of articleIds) {
        if (isRead) {
          suppressPendingReadIds.current.add(articleId);
        } else {
          suppressPendingReadIds.current.delete(articleId);
        }
        clearPendingRead(articleId);
        applyArticleStateChange(queryClient, { articleId, is_read: isRead });
        broadcast({ type: 'state-change', articleId, is_read: isRead });
      }
    },
    [clearPendingRead, queryClient],
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
      syncBatchReadState(articleIds, true);
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
      await Promise.all(
        articleIds.map((articleId) =>
          apiFetch(`/api/articles/${articleId}/state`, {
            method: 'PATCH',
            body: JSON.stringify({ is_read: false }),
          }),
        ),
      );
      syncBatchReadState(articleIds, false);
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
      setBulkReadUndo(null);
    } finally {
      setIsBulkUpdating(false);
    }
  }, [bulkReadUndo, isBulkUpdating, queryClient, syncBatchReadState]);

  const counts = useMemo(
    () => ({
      unread: items.filter((item) => !item.is_read).length,
      read: items.filter((item) => item.is_read).length,
      all: items.length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    if (currentView === 'starred') return items;
    if (readFilter === 'unread') return items.filter((item) => !item.is_read || pendingReadIds.has(item.id));
    if (readFilter === 'read') return items.filter((item) => item.is_read);
    return items;
  }, [currentView, items, pendingReadIds, readFilter]);

  const externalIndex = selectedArticleId == null ? -1 : filteredItems.findIndex((item) => item.id === selectedArticleId);
  const activeIndex =
    externalIndex >= 0 ? externalIndex : filteredItems.length === 0 ? -1 : Math.min(selectedIndex, filteredItems.length - 1);

  const RowComponent = density === 'compact' ? FeedRowCompact : FeedRowComfortable;
  const headerLabel =
    currentView === 'today'
      ? t('nav.today')
      : currentView === 'starred'
        ? t('nav.starred')
        : currentView === 'sources'
          ? selectedSource?.title ?? t('feed.allSources')
          : t('nav.all');
  const showReadFilters = currentView !== 'starred';
  const sourceColor = selectedSource ? getSourceColor(selectedSource) : null;
  const showBulkRead = Boolean(showReadFilters && readFilter === 'unread' && bulkScope && counts.unread > 0);
  const isBulkConfirmOpen = Boolean(showBulkRead && bulkScope && openBulkConfirmScope === bulkScope.scope);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg)] md:w-[300px]">
      <header className="shrink-0 border-b border-[var(--border-light)] px-3 pb-2 pt-[10px]">
        {currentView === 'sources' && selectedSource ? (
          <button
            type="button"
            onClick={() => setCurrentView('sources', null)}
            className="flex items-center gap-1 pb-[6px] text-[11.5px] text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
          >
            <ChevronLeft size={13} />
            {t('feed.allSources')}
          </button>
        ) : null}

        <div className={`flex items-center gap-[7px] ${showReadFilters ? 'mb-[7px]' : ''}`}>
          {sourceColor ? <span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ backgroundColor: sourceColor }} /> : null}
          <span className="text-[14px] font-semibold text-[var(--text)]">{headerLabel}</span>
        </div>

        {showReadFilters ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 gap-0.5">
                {READ_FILTERS.map(({ id, labelKey }) => {
                  const active = readFilter === id;
                  const count = counts[id];

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setReadFilter(id);
                        setOpenBulkConfirmScope(null);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11.5px] transition-colors ${
                        active
                          ? 'bg-[var(--accent-bg)] font-semibold text-[var(--accent)]'
                          : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {t(labelKey)}
                      <span className="text-[10px] opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
              {showBulkRead ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={t('feed.allRead')}
                    aria-expanded={isBulkConfirmOpen}
                    onClick={() => setOpenBulkConfirmScope((scope) => (scope === bulkScope?.scope ? null : (bulkScope?.scope ?? null)))}
                    disabled={isBulkUpdating}
                    className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--text-3)] shadow-[0_1px_0_rgba(65,52,35,0.04)] transition-colors hover:border-[var(--border-accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('feed.allRead')}
                  </button>
                  {isBulkConfirmOpen ? (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[238px] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-[0_18px_48px_rgba(30,24,16,0.16)]">
                      <div className="px-2 pb-2 pt-1">
                        <div className="text-[11.5px] font-semibold text-[var(--text)]">{t('feed.confirmAllRead')}</div>
                        <div className="mt-0.5 text-[10.5px] leading-4 text-[var(--text-3)]">
                          {t('feed.confirmAllReadDescription')}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 px-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setOpenBulkConfirmScope(null)}
                          disabled={isBulkUpdating}
                          className="rounded-full px-3 py-1.5 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('feed.cancel')}
                        </button>
                        <button
                          type="button"
                          aria-label={t('feed.confirmAllReadAria')}
                          onClick={() => void handleBulkMarkRead()}
                          disabled={isBulkUpdating}
                          className="rounded-full bg-[var(--bg-nav)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-inverse)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('feed.confirm')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {bulkReadUndo ? (
              <div className="mt-2 rounded-xl bg-[var(--accent-bg)] px-3 py-2 text-[11.5px] text-[var(--accent)]">
                <span>
                  {t('feed.bulkReadNotice', { scope: bulkReadUndo.label, count: bulkReadUndo.articleIds.length })}
                </span>
                <button
                  type="button"
                  aria-label={t('feed.undoBulkAria')}
                  onClick={() => void handleUndoBulkMarkRead()}
                  disabled={isBulkUpdating}
                  className="ml-2 font-semibold underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {t('feed.undo')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          density === 'compact' ? <CompactSkeleton /> : <FeedSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className="px-7 py-10 text-center text-[13px] text-[var(--text-3)]">
            {readFilter === 'unread' ? t('feed.allCaughtUp') : t('feed.nothingHere')}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredItems.map((item, index) => (
              <RowComponent
                key={item.id}
                item={item as FeedArticleItem}
                selected={index === activeIndex}
                pendingRead={pendingReadIds.has(item.id)}
                onClick={() => {
                  setSelectedIndex(index);
                  onOpenArticle?.(item);
                }}
                onMarkRead={() => void updateArticleReadState(item as FeedArticleItem, true)}
                onUndoRead={() => void updateArticleReadState(item as FeedArticleItem, false)}
              />
            ))}
            <div ref={ref} className="h-10" />
            {isFetchingNextPage ? (
              <div className="flex justify-center py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
