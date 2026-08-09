'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedList } from '@/components/feed/FeedList';
import { ArticleView } from '@/components/reader/ArticleView';
import { SourceBrowser } from '@/components/layout/SourceBrowser';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange, coordinatedReadStateChange } from '@/lib/article-state-cache';
import { broadcast } from '@/lib/broadcast';
import { useI18n } from '@/lib/i18n';
import { useReaderShortcuts } from '@/hooks/useReaderShortcuts';
import { useArticles } from '@/lib/queries/articles';
import { toggleReaderFocusMode } from '@/lib/reader-layout';
import { contextFromView, parseQueueContext, writeQueueContext, type QueueContext } from '@/lib/queue-context';
import { useReadStateCoordinator, useReadSyncState } from '@/components/providers/ReadStateProvider';
import type { ArticleStateSnapshot } from '@/lib/read-state-coordinator';
import { queueContextKey, resolveAdvanceMode, shouldUndoNavigate, type AdvancePhase } from '@/lib/reader-advance';
import { useUIStore } from '@/stores/useUIStore';
import type { ArticleItem } from '@/lib/types';

function filterQueueItems(items: ArticleItem[], context: QueueContext, selectedArticleId: number | null) {
  if (context.tab === 'starred') return items;
  if (context.readFilter === 'unread') {
    return items.filter((item) => !item.is_read || item.id === selectedArticleId);
  }
  if (context.readFilter === 'read') return items.filter((item) => item.is_read);
  return items;
}

function FeedPageContent() {
  const queryClient = useQueryClient();
  const readCoordinator = useReadStateCoordinator();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const currentView = useUIStore((state) => state.currentView);
  const selectedSourceId = useUIStore((state) => state.selectedSourceId);
  const readFilter = useUIStore((state) => state.readFilter);
  const layout = useUIStore((state) => state.layout);
  const focusMode = useUIStore((state) => state.focusMode);
  const setLayout = useUIStore((state) => state.setLayout);
  const setFocusMode = useUIStore((state) => state.setFocusMode);
  const [advancePhase, setAdvancePhase] = useState<AdvancePhase>('idle');
  const [undoAction, setUndoAction] = useState<{
    fromId: number;
    targetId: number | null;
    contextKey: string;
    originalDesired: boolean;
    generation: number;
    navigated: boolean;
  } | null>(null);
  const advanceLockRef = useRef<number | null>(null);
  const navigationTargetRef = useRef<number | null>(null);
  const advanceGenerationRef = useRef(0);
  const undoTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const selectedArticleIdRef = useRef<number | null>(null);
  const undoActionRef = useRef<typeof undoAction>(null);

  const articleParam = searchParams.get('article');
  const selectedArticleId = articleParam ? Number(articleParam) : null;
  const selectedArticleIdForList =
    typeof selectedArticleId === 'number' && Number.isFinite(selectedArticleId) ? selectedArticleId : null;
  const selectedId = selectedArticleIdForList == null ? null : selectedArticleIdForList.toString();
  useEffect(() => {
    selectedArticleIdRef.current = selectedArticleIdForList;
  }, [selectedArticleIdForList]);

  const liveQueueContext = useMemo(
    () => contextFromView(currentView, currentView === 'sources' ? selectedSourceId : null, readFilter),
    [currentView, readFilter, selectedSourceId],
  );
  const readerQueueContext = useMemo(
    () => (selectedId ? parseQueueContext(new URLSearchParams(searchParams.toString()), liveQueueContext) : liveQueueContext),
    [liveQueueContext, searchParams, selectedId],
  );

  const buildReaderUrl = useCallback(
    (articleId: number, context: QueueContext = readerQueueContext) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('article', articleId.toString());
      writeQueueContext(params, context);
      return `/?${params.toString()}`;
    },
    [readerQueueContext, searchParams],
  );

  const handleOpenArticle = useCallback(
    (article: ArticleItem) => {
      router.push(buildReaderUrl(article.id, liveQueueContext));
    },
    [buildReaderUrl, liveQueueContext, router],
  );

  const closeArticle = useCallback(() => {
    if (focusMode) {
      setFocusMode(false);
      if (layout === 'focus') {
        setLayout('classic');
      }
    }

    router.replace('/');
  }, [focusMode, layout, router, setFocusMode, setLayout]);

  useEffect(() => {
    if (!selectedId || (searchParams.has('ctx') && searchParams.has('read'))) return;
    router.replace(buildReaderUrl(Number(selectedId), readerQueueContext), { scroll: false });
  }, [buildReaderUrl, readerQueueContext, router, searchParams, selectedId]);

  const showSourceBrowser = currentView === 'sources' && selectedSourceId === null;
  const articleReadFilter = readerQueueContext.readFilter !== 'all' ? readerQueueContext.readFilter : undefined;
  const baseQuery = useArticles(readerQueueContext.tab, readerQueueContext.sourceId, articleReadFilter, {
    enabled: !showSourceBrowser,
  });
  const baseItems = useMemo(() => baseQuery.data?.pages.flatMap((page) => page.items) ?? [], [baseQuery.data]);
  const baseHasSelected = selectedArticleIdForList != null && baseItems.some((item) => item.id === selectedArticleIdForList);
  const restoreQuery = useArticles(readerQueueContext.tab, readerQueueContext.sourceId, articleReadFilter, {
    enabled: !showSourceBrowser && selectedArticleIdForList != null && !baseHasSelected,
    afterArticleId: selectedArticleIdForList ?? undefined,
  });
  const { data: restoredCurrent } = useQuery({
    queryKey: ['article', selectedId],
    queryFn: () => apiFetch<ArticleItem>(`/api/articles/${selectedId}`),
    enabled: selectedId != null && !baseHasSelected,
  });
  const restoredSuccessors = useMemo(
    () => restoreQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [restoreQuery.data],
  );
  const items = useMemo(
    () => baseHasSelected || selectedId == null
      ? baseItems
      : restoredCurrent
        ? [restoredCurrent, ...restoredSuccessors.filter((item) => item.id !== restoredCurrent.id)]
        : baseItems,
    [baseHasSelected, baseItems, restoredCurrent, restoredSuccessors, selectedId],
  );
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
  const filteredItems = useMemo(
    () => filterQueueItems(items, readerQueueContext, selectedArticleIdForList),
    [items, readerQueueContext, selectedArticleIdForList],
  );
  const currentIndex = filteredItems.findIndex((item) => item.id === selectedArticleIdForList);
  const currentArticle = currentIndex >= 0 ? filteredItems[currentIndex] : null;
  const activeHasNextPage = baseHasSelected
    ? Boolean(baseQuery.hasNextPage)
    : Boolean(restoreQuery.hasNextPage || restoreQuery.isLoading);
  const currentDesiredRead = currentArticle
    ? (readCoordinator.get(currentArticle.id)?.desired ?? Boolean(currentArticle.is_read))
    : false;
  const advanceMode = resolveAdvanceMode({
    hasCurrent: currentArticle != null,
    hasKnownNext: currentIndex >= 0 && currentIndex < filteredItems.length - 1,
    hasNextPage: activeHasNextPage,
    desiredRead: currentDesiredRead,
  });

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const dismissUndo = useCallback(() => {
    clearUndoTimer();
    undoActionRef.current = null;
    setUndoAction(null);
  }, [clearUndoTimer]);

  const scheduleUndoExpiry = useCallback(() => {
    clearUndoTimer();
    if (!undoActionRef.current?.navigated) return;
    undoTimerRef.current = window.setTimeout(() => {
      undoActionRef.current = null;
      setUndoAction(null);
      undoTimerRef.current = null;
    }, 4_000);
  }, [clearUndoTimer]);

  const showUndo = useCallback((action: Omit<NonNullable<typeof undoAction>, 'navigated'>) => {
    clearUndoTimer();
    const nextAction = { ...action, navigated: action.targetId == null };
    undoActionRef.current = nextAction;
    setUndoAction(nextAction);
    if (nextAction.navigated) scheduleUndoExpiry();
  }, [clearUndoTimer, scheduleUndoExpiry]);

  useEffect(() => () => {
    clearUndoTimer();
    if (watchdogRef.current != null) window.clearTimeout(watchdogRef.current);
  }, [clearUndoTimer]);

  useEffect(() => {
    const targetId = navigationTargetRef.current;
    if (targetId == null || selectedArticleIdForList !== targetId) return;

    if (watchdogRef.current != null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    navigationTargetRef.current = null;
    advanceLockRef.current = null;
    setAdvancePhase('observed');
    if (undoActionRef.current?.targetId === targetId) {
      const observedUndo = { ...undoActionRef.current, navigated: true };
      undoActionRef.current = observedUndo;
      setUndoAction(observedUndo);
      scheduleUndoExpiry();
    }
    const frame = window.requestAnimationFrame(() => setAdvancePhase('idle'));
    return () => window.cancelAnimationFrame(frame);
  }, [scheduleUndoExpiry, selectedArticleIdForList]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearUndoTimer();
      else scheduleUndoExpiry();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearUndoTimer, scheduleUndoExpiry]);

  const handleArticleNotFound = useCallback(() => {
    const fallbackArticle = filteredItems.find((item) => item.id !== selectedArticleIdForList) ?? null;
    if (fallbackArticle) {
      router.replace(buildReaderUrl(fallbackArticle.id), { scroll: false });
      return;
    }

    closeArticle();
  }, [buildReaderUrl, closeArticle, filteredItems, router, selectedArticleIdForList]);

  const updateArticleState = useCallback(
    async (
      articleId: number,
      nextState: { is_read?: boolean; is_starred?: boolean },
      previousState: { is_read?: boolean; is_starred?: boolean },
    ) => {
      applyArticleStateChange(queryClient, { articleId, ...nextState });

      try {
        const snapshot = await apiFetch<ArticleStateSnapshot>(`/api/articles/${articleId}/state`, {
          method: 'PATCH',
          body: JSON.stringify(nextState),
        });
        applyArticleStateChange(queryClient, {
          articleId,
          is_read: snapshot.is_read,
          is_starred: snapshot.is_starred,
          state_version: snapshot.state_version,
        });
        broadcast({ type: 'state-change', articleId, is_read: snapshot.is_read, is_starred: snapshot.is_starred, state_version: snapshot.state_version });
      } catch {
        applyArticleStateChange(queryClient, { articleId, ...previousState });
      }
    },
    [queryClient],
  );

  const handleMarkRead = useCallback(
    (article: ArticleItem | null) => {
      if (!article || article.is_read) return;
      void readCoordinator.setDesired(article.id, true);
    },
    [readCoordinator],
  );

  const handleToggleStar = useCallback(
    (article: ArticleItem | null) => {
      if (!article) return;

      void updateArticleState(
        article.id,
        { is_starred: !article.is_starred },
        { is_starred: article.is_starred },
      );
    },
    [updateArticleState],
  );

  const handleToggleFocus = useCallback(() => {
    toggleReaderFocusMode(focusMode, layout, setLayout, setFocusMode);
  }, [focusMode, layout, setFocusMode, setLayout]);

  const selectArticleAtIndex = useCallback(
    (index: number) => {
      const article = filteredItems[index];
      if (!article) return;
      router.push(buildReaderUrl(article.id));
    },
    [buildReaderUrl, filteredItems, router],
  );

  const handleAdvance = useCallback(async () => {
    if (!currentArticle || advanceLockRef.current != null) return;

    const fromId = currentArticle.id;
    const contextKey = queueContextKey(readerQueueContext);
    const coordinatorState = readCoordinator.get(fromId);
    const originalDesired = coordinatorState?.desired ?? Boolean(currentArticle.is_read);
    const originalConfirmed = coordinatorState?.confirmed ?? Boolean(currentArticle.is_read);
    const generation = ++advanceGenerationRef.current;
    advanceLockRef.current = fromId;

    let target = currentIndex >= 0 ? filteredItems[currentIndex + 1] : undefined;
    if (!target && activeHasNextPage) {
      setAdvancePhase('loading');
      try {
        const result = baseHasSelected
          ? await baseQuery.fetchNextPage()
          : await restoreQuery.fetchNextPage();
        const fetchedItems = result.data?.pages.flatMap((page) => page.items) ?? [];
        const materializedItems = baseHasSelected || !restoredCurrent
          ? fetchedItems
          : [restoredCurrent, ...fetchedItems.filter((item) => item.id !== restoredCurrent.id)];
        const fetchedQueue = filterQueueItems(materializedItems, readerQueueContext, fromId);
        const fetchedIndex = fetchedQueue.findIndex((item) => item.id === fromId);
        target = fetchedIndex >= 0 ? fetchedQueue[fetchedIndex + 1] : undefined;
      } catch {
        advanceLockRef.current = null;
        setAdvancePhase('idle');
        return;
      }
    }

    if (!originalDesired) {
      setAdvancePhase('mutating');
      void readCoordinator.setDesired(fromId, true);
    }

    if (!target) {
      advanceLockRef.current = null;
      setAdvancePhase('idle');
      if (!originalDesired) {
        showUndo({ fromId, targetId: null, contextKey, originalDesired, generation });
      }
      return;
    }

    navigationTargetRef.current = target.id;
    setAdvancePhase(`navigating:${target.id}`);
    if (!(originalConfirmed && originalDesired)) {
      showUndo({ fromId, targetId: target.id, contextKey, originalDesired, generation });
    }
    router.push(buildReaderUrl(target.id, readerQueueContext), { scroll: false });

    if (watchdogRef.current != null) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = window.setTimeout(() => {
      if (navigationTargetRef.current !== target.id) return;
      navigationTargetRef.current = null;
      advanceLockRef.current = null;
      setAdvancePhase('idle');
      dismissUndo();
      if (selectedArticleIdRef.current === fromId && !originalDesired) {
        void readCoordinator.setDesired(fromId, originalDesired);
      }
    }, 5_000);
  }, [
    activeHasNextPage,
    baseHasSelected,
    baseQuery,
    buildReaderUrl,
    currentArticle,
    currentIndex,
    dismissUndo,
    filteredItems,
    readCoordinator,
    readerQueueContext,
    restoreQuery,
    restoredCurrent,
    router,
    showUndo,
  ]);

  const handleUndoAdvance = useCallback(() => {
    if (!undoAction) return;
    const action = undoAction;
    dismissUndo();
    void readCoordinator.setDesired(action.fromId, action.originalDesired);

    if (
      action.targetId != null
      && shouldUndoNavigate({
        currentId: selectedArticleIdForList,
        targetId: action.targetId,
        currentContextKey: queueContextKey(readerQueueContext),
        actionContextKey: action.contextKey,
        currentGeneration: advanceGenerationRef.current,
        actionGeneration: action.generation,
      })
    ) {
      router.push(buildReaderUrl(action.fromId, readerQueueContext), { scroll: false });
    }
  }, [
    buildReaderUrl,
    dismissUndo,
    readCoordinator,
    readerQueueContext,
    router,
    selectedArticleIdForList,
    undoAction,
  ]);

  useReaderShortcuts({
    onNext: handleAdvance,
    onPrev: () => {
      if (currentIndex > 0) {
        selectArticleAtIndex(currentIndex - 1);
      }
    },
    onToggleStar: () => handleToggleStar(currentArticle),
    onMarkRead: () => handleMarkRead(currentArticle),
    onToggleFocus: handleToggleFocus,
  });

  const undoVisible = Boolean(
    undoAction?.navigated
    && selectedArticleIdForList === (undoAction.targetId ?? undoAction.fromId)
    && queueContextKey(readerQueueContext) === undoAction.contextKey,
  );
  const undoSyncState = useReadSyncState(undoAction?.fromId ?? null);
  const undoMessage = undoSyncState?.syncStatus === 'unsynced'
    ? t('reader.readUnsynced')
    : undoSyncState?.syncStatus === 'syncing'
      ? t('reader.syncingRead')
      : undoSyncState && !undoSyncState.confirmed
        ? t('reader.previousMarkFailed')
        : undoAction?.targetId == null
          ? t('reader.queueComplete')
          : t('reader.previousMarkedRead');
  const canUndo = Boolean(undoAction && undoSyncState?.desired !== undoAction.originalDesired);

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg)]">
      <motion.div
        animate={{
          width: focusMode ? 0 : 'var(--list-width)',
          opacity: focusMode ? 0 : 1,
          pointerEvents: focusMode ? 'none' : 'auto',
        }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className={`relative z-20 h-full shrink-0 overflow-hidden bg-[var(--bg)] lg:border-r lg:border-[var(--border)] ${
          selectedId ? 'hidden lg:flex' : 'flex w-full lg:w-auto'
        }`}
      >
        {showSourceBrowser ? (
          <div className="h-full w-full">
            <SourceBrowser />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <FeedList onOpenArticle={handleOpenArticle} selectedArticleId={selectedArticleIdForList} />
          </div>
        )}
      </motion.div>

      <main className={`relative h-full min-w-0 flex-1 overflow-hidden bg-[var(--bg)] ${selectedId ? 'block' : 'hidden lg:block'}`}>
        <AnimatePresence mode="wait">
          {selectedId ? (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ArticleView
                id={selectedId}
                onClose={closeArticle}
                onNext={advanceMode === 'next' || advanceMode === 'load-next' ? handleAdvance : undefined}
                onPrev={currentIndex > 0 ? () => selectArticleAtIndex(currentIndex - 1) : undefined}
                onNotFound={handleArticleNotFound}
                className="h-full"
                next={currentIndex >= 0 && currentIndex < filteredItems.length - 1 ? filteredItems[currentIndex + 1] : null}
                position={currentIndex >= 0 ? currentIndex + 1 : undefined}
                total={filteredItems.length}
                onAdvance={handleAdvance}
                advanceMode={advanceMode}
                advancePhase={advancePhase}
              />
            </motion.div>
          ) : (
            <div className="flex h-full items-center justify-center px-12 text-center select-none">
              <div className="max-w-sm space-y-6 text-[var(--text-3)]">
                <div className="font-serif text-[22px] italic text-[var(--text-2)]">{t('feed.selectArticle')}</div>
                <p className="whitespace-pre-line text-sm leading-6">{t('feed.selectArticleHint')}</p>
              </div>
            </div>
          )}
        </AnimatePresence>
        {undoVisible && undoAction ? (
          <div
            role="status"
            aria-live="polite"
            onFocusCapture={clearUndoTimer}
            onBlurCapture={scheduleUndoExpiry}
            onPointerDown={clearUndoTimer}
            onPointerUp={scheduleUndoExpiry}
            className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-2)] shadow-lg"
          >
            <span>{undoMessage}</span>
            {canUndo ? (
              <button type="button" className="font-semibold text-[var(--accent)]" onClick={handleUndoAdvance}>
                {t('feed.undo')}
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageContent />
    </Suspense>
  );
}
