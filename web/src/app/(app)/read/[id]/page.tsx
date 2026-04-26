'use client';

import { use, useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange } from '@/lib/article-state-cache';
import { estimateReadMinutes, formatRelativeTime, getDisplayTitle, isLikelySummaryOnly, isSameLanguage } from '@/lib/article-meta';
import { broadcast } from '@/lib/broadcast';
import { useI18n } from '@/lib/i18n';
import { useReaderShortcuts } from '@/hooks/useReaderShortcuts';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import { useUIStore } from '@/stores/useUIStore';
import { getActiveReaderLayout, toggleReaderFocusMode } from '@/lib/reader-layout';
import { ReaderHeader } from '@/components/reader/ReaderHeader';
import { ReaderGestureHint } from '@/components/reader/ReaderGestureHint';
import { KeyPointsCallout } from '@/components/reader/KeyPointsCallout';
import { BilingualBody } from '@/components/reader/BilingualBody';
import { PrevNextBar } from '@/components/reader/PrevNextBar';
import { NextUpCard } from '@/components/reader/NextUpCard';
import { TweaksPanel } from '@/components/reader/TweaksPanel';
import { useArticleNeighbors } from '@/lib/queries/neighbors';
import { HighlightLayer } from '@/components/reader/HighlightLayer';
import { SourceExcerptNotice } from '@/components/reader/SourceExcerptNotice';
import type { ArticleItem, ArticleTab } from '@/lib/types';

interface ArticleDetail extends ArticleItem {
  content_html?: string;
  content_text?: string;
  is_read?: boolean;
  is_starred?: boolean;
  reading_progress?: unknown;
}

interface ArticleAI {
  title_translated?: string;
  summary?: string;
}

interface OriginalContent {
  url: string;
  title?: string;
  content_html: string;
  content_text: string;
}

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function ReaderContent({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoMarkedArticleIds = useRef(new Set<number>());
  const [progressState, setProgressState] = useState({ articleId: id, value: 0 });
  const [originalContentState, setOriginalContentState] = useState<{ articleId: string; content: OriginalContent } | null>(null);
  const [loadingOriginalId, setLoadingOriginalId] = useState<string | null>(null);
  const [originalErrorState, setOriginalErrorState] = useState<{ articleId: string; message: string } | null>(null);

  const nativeLanguage = useUIStore((state) => state.nativeLanguage);
  const fontSize = useUIStore((state) => state.fontSize);
  const layout = useUIStore((state) => state.layout);
  const setLayout = useUIStore((state) => state.setLayout);
  const focusMode = useUIStore((state) => state.focusMode);
  const setFocusMode = useUIStore((state) => state.setFocusMode);

  const activeLayout = getActiveReaderLayout(layout, focusMode);
  const tab = normalizeTab(searchParams.get('ctx') ?? searchParams.get('tab'));
  const articleId = Number(id);

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => apiFetch<ArticleDetail>(`/api/articles/${id}`),
  });

  const titleNeedsTranslation = article ? !isSameLanguage(article.language, nativeLanguage) : false;
  const { data: ai, isFetching: isFetchingAI } = useQuery({
    queryKey: ['article-ai', id, nativeLanguage],
    queryFn: () => apiFetch<ArticleAI>(`/api/articles/${id}/ai?lang=${nativeLanguage}`).catch(() => null),
    enabled: !!article && titleNeedsTranslation,
  });

  const { prev, next, position, total } = useArticleNeighbors(articleId, tab);

  const progress = progressState.articleId === id ? progressState.value : 0;
  const originalContent = originalContentState?.articleId === id ? originalContentState.content : null;
  const isLoadingOriginal = loadingOriginalId === id;
  const originalError = originalErrorState?.articleId === id ? originalErrorState.message : null;

  const markRead = useCallback(
    async (articleToMarkReadId: number) => {
      try {
        await apiFetch(`/api/articles/${articleToMarkReadId}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: true }),
        });
        broadcast({ type: 'state-change', articleId: articleToMarkReadId, is_read: true });
      } catch {
        // Keep navigation responsive even if background mark-read fails.
      }
    },
    [],
  );

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight <= 0) {
      setProgressState({ articleId: id, value: 0 });
      return;
    }

    setProgressState({ articleId: id, value: Math.min(1, element.scrollTop / scrollHeight) });
  }, [id]);

  useEffect(() => {
    if (!article || article.is_read || progress < 0.75 || autoMarkedArticleIds.current.has(article.id)) {
      return;
    }

    autoMarkedArticleIds.current.add(article.id);
    applyArticleStateChange(queryClient, { articleId: article.id, is_read: true });

    void apiFetch(`/api/articles/${article.id}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    })
      .then(() => {
        broadcast({ type: 'state-change', articleId: article.id, is_read: true });
      })
      .catch(() => {
        autoMarkedArticleIds.current.delete(article.id);
        applyArticleStateChange(queryClient, { articleId: article.id, is_read: article.is_read });
      });
  }, [article, progress, queryClient]);

  const navigateTo = useCallback(
    (target: ArticleItem | null, fallback?: () => void) => {
      if (target) {
        const params = new URLSearchParams();
        const ctx = searchParams.get('ctx') ?? searchParams.get('tab');
        if (ctx) params.set('ctx', ctx);
        void markRead(articleId);
        router.push(`/read/${target.id}${params.toString() ? `?${params.toString()}` : ''}`);
        return;
      }

      fallback?.();
    },
    [articleId, markRead, router, searchParams],
  );

  const handleBackToList = useCallback(() => {
    const ctx = searchParams.get('ctx') ?? searchParams.get('tab');
    const params = new URLSearchParams();
    if (ctx) params.set('tab', ctx);
    router.push(`/${params.toString() ? `?${params.toString()}` : ''}`);
  }, [router, searchParams]);

  const handleToggleStar = useCallback(async () => {
    if (!article) return;

    const nextStarred = !article.is_starred;
    applyArticleStateChange(queryClient, { articleId, is_starred: nextStarred });

    try {
      await apiFetch(`/api/articles/${id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ is_starred: nextStarred }),
      });
      broadcast({ type: 'state-change', articleId, is_starred: nextStarred });
    } catch {
      applyArticleStateChange(queryClient, { articleId, is_starred: article.is_starred });
    }
  }, [article, articleId, id, queryClient]);

  const handleShare = useCallback(async () => {
    if (!article) return;

    try {
      await navigator.clipboard.writeText(article.link);
    } catch {
      window.open(article.link, '_blank', 'noopener,noreferrer');
    }
  }, [article]);

  const handleToggleFocus = useCallback(() => {
    toggleReaderFocusMode(focusMode, layout, setLayout, setFocusMode);
  }, [focusMode, layout, setFocusMode, setLayout]);

  const handleLoadOriginal = useCallback(async () => {
    if (!article) return;

    setLoadingOriginalId(id);
    setOriginalErrorState(null);
    try {
      const content = await apiFetch<OriginalContent>(`/api/articles/${article.id}/original`, { method: 'POST' });
      setOriginalContentState({ articleId: id, content });
      queryClient.setQueryData<ArticleDetail>(['article', id], (previous) =>
        previous ? { ...previous, content_html: content.content_html, content_text: content.content_text } : previous,
      );
      setProgressState({ articleId: id, value: 0 });
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('reader.originalLoadError');
      setOriginalErrorState({ articleId: id, message });
    } finally {
      setLoadingOriginalId(null);
    }
  }, [article, id, queryClient, t]);

  const handleMarkReadCurrent = useCallback(
    async (targetArticle: ArticleDetail) => {
      if (targetArticle.is_read) return;

      applyArticleStateChange(queryClient, { articleId: targetArticle.id, is_read: true });

      try {
        await apiFetch(`/api/articles/${targetArticle.id}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: true }),
        });
        broadcast({ type: 'state-change', articleId: targetArticle.id, is_read: true });
      } catch {
        applyArticleStateChange(queryClient, { articleId: targetArticle.id, is_read: targetArticle.is_read });
      }
    },
    [queryClient],
  );

  useReaderShortcuts({
    onNext: () => navigateTo(next),
    onPrev: () => navigateTo(prev),
    onToggleStar: () => {
      void handleToggleStar();
    },
    onMarkRead: () => {
      if (article) {
        void handleMarkReadCurrent(article);
      }
    },
    onToggleFocus: handleToggleFocus,
    onEscape: () => {
      if (focusMode) {
        setFocusMode(false);
      }
    },
  });

  const { gestureHint, touchHandlers } = useReaderGestures({
    scrollRef,
    progress,
    hasNext: Boolean(next),
    hasPrev: Boolean(prev),
    onNext: () => navigateTo(next),
    onPrev: () => navigateTo(prev),
    onBack: handleBackToList,
  });

  if (isLoading || !article) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
      </div>
    );
  }

  const displayTitle = ai?.title_translated || article.title_translated || getDisplayTitle(article);
  const showOriginal = titleNeedsTranslation && displayTitle !== article.title;
  const titleLoading = titleNeedsTranslation && !displayTitle && isFetchingAI;
  const summary = ai?.summary || article.summary || '';
  const relativeTime = article.published_at ? formatRelativeTime(article.published_at) : '';
  const showSourceExcerptNotice = isLikelySummaryOnly(article) && !originalContent;
  const contentHtml = originalContent?.content_html || article.content_html || '';
  const contentText = originalContent?.content_text || article.content_text || '';
  const readMinutes = estimateReadMinutes({ ...article, content_html: contentHtml, content_text: contentText });

  const bylineItems = [
    relativeTime ? { key: 'age', content: <span>{t('article.ago', { time: relativeTime })}</span> } : null,
    readMinutes ? { key: 'time', content: <span>{t('article.minRead', { count: readMinutes })}</span> } : null,
    article.source_title
      ? {
          key: 'source',
          content: <span className="rounded-[5px] bg-[var(--bg-hover)] px-[7px] py-[1px]">{article.source_title}</span>,
        }
      : null,
    titleNeedsTranslation
      ? {
          key: 'translation',
          content: (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent)]">
              <Languages size={11} />
              {t('reader.translationLabel', { language: nativeLanguage })}
            </span>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; content: React.ReactNode }>;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg)]">
      <div className="absolute left-0 right-0 top-0 z-[60] h-[2.5px] bg-[var(--border-light)]">
        <motion.div className="h-full rounded-r-[2px] bg-[var(--accent)]" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} />
      </div>

      <ReaderHeader
        article={{ ...article, title_translated: displayTitle }}
        position={position}
        total={total}
        progress={progress}
        focusMode={focusMode}
        onBack={handleBackToList}
        onToggleStar={handleToggleStar}
        onToggleFocus={handleToggleFocus}
        onShare={handleShare}
      />

      <ReaderGestureHint hint={gestureHint} />

      <div
        ref={scrollRef}
        data-reader-scroll="true"
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none touch-pan-y"
        {...touchHandlers}
      >
        <HighlightLayer articleId={articleId}>
          <div className={`pb-12 pt-[44px] ${activeLayout === 'wide' ? 'px-7 md:px-14' : 'px-7 md:px-7'}`}>
            <article className={activeLayout === 'wide' ? 'max-w-none' : 'mx-auto max-w-[680px]'}>
              {titleLoading ? (
                <div className="mb-3 inline-flex items-center gap-2 font-serif text-[18px] text-[var(--text-3)]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  {t('reader.translatingTitle')}
                </div>
              ) : (
                <h1
                  className="font-serif font-semibold leading-[1.22] tracking-[-0.03em] text-[var(--text)]"
                  style={{ fontSize: `${fontSize + 10}px` }}
                >
                  {displayTitle}
                </h1>
              )}

              {showOriginal ? (
                <p className="mb-3 mt-[6px] font-serif italic leading-[1.4] text-[var(--text-3)]" style={{ fontSize: `${fontSize + 1}px` }}>
                  {article.title}
                </p>
              ) : null}

              {bylineItems.length > 0 ? (
                <div className="mb-9 flex flex-wrap items-center gap-[10px] text-[12.5px] text-[var(--text-3)]">
                  {bylineItems.map((item, index) => (
                    <div key={item.key} className="inline-flex items-center gap-[10px]">
                      {index > 0 ? <span className="text-[var(--border)]">·</span> : null}
                      {item.content}
                    </div>
                  ))}
                </div>
              ) : null}

              {summary ? <KeyPointsCallout text={summary} /> : null}

              {showSourceExcerptNotice ? (
                <SourceExcerptNotice
                  error={originalError}
                  isLoading={isLoadingOriginal}
                  link={article.link}
                  onLoadOriginal={handleLoadOriginal}
                />
              ) : null}

              <div className="font-reader-text min-w-0 max-w-full text-[var(--text)]" style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}>
                {contentHtml ? (
                  <BilingualBody
                    articleId={article.id}
                    contentHtml={contentHtml}
                    language={article.language}
                    nativeLanguage={nativeLanguage}
                  />
                ) : (
                  <p className="overflow-wrap-anywhere">{contentText}</p>
                )}
              </div>

              {next ? <NextUpCard next={next} currentId={article.id} markRead={markRead} /> : null}
            </article>
          </div>
        </HighlightLayer>
      </div>

      <PrevNextBar
        current={article}
        prev={prev}
        next={next}
        position={position}
        total={total}
        markRead={markRead}
      />
      <TweaksPanel />
    </div>
  );
}

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[var(--bg)]">
          <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
        </div>
      }
    >
      <ReaderContent id={id} />
    </Suspense>
  );
}
