'use client';

import { use, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { apiFetch } from '@/lib/api-client';
import { broadcast } from '@/lib/broadcast';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useUIStore } from '@/stores/useUIStore';
import { ReaderHeader } from '@/components/reader/ReaderHeader';
import { KeyPointsCallout } from '@/components/reader/KeyPointsCallout';
import { BilingualBody } from '@/components/reader/BilingualBody';
import { PrevNextBar } from '@/components/reader/PrevNextBar';
import { NextUpCard } from '@/components/reader/NextUpCard';
import { useArticleNeighbors } from '@/lib/queries/neighbors';
import { HighlightLayer } from '@/components/reader/HighlightLayer';
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
  body_translation_status?: string;
  body_translation_content?: string;
}

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function ReaderContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const nativeLanguage = useUIStore((s) => s.nativeLanguage);
  const tab = normalizeTab(searchParams.get('ctx') ?? searchParams.get('tab'));
  const articleId = Number(id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [articleId]);

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => apiFetch<ArticleDetail>(`/api/articles/${id}`),
  });

  const { data: ai } = useQuery({
    queryKey: ['article-ai', id, nativeLanguage],
    queryFn: () => apiFetch<ArticleAI>(`/api/articles/${id}/ai?lang=${nativeLanguage}`).catch(() => null),
    enabled: !!article,
  });

  const { prev, next, position, total } = useArticleNeighbors(articleId, tab);

  const markRead = useCallback(async (articleToMarkReadId: number) => {
    try {
      await apiFetch(`/api/articles/${articleToMarkReadId}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true }),
      });
      broadcast({ type: 'state-change', articleId: articleToMarkReadId, is_read: true });
    } catch {
      // Ignore failed background mutations.
    }
  }, []);

  const navigateTo = useCallback(
    (a: ArticleItem | null, fallback?: () => void) => {
      if (a) {
        const params = new URLSearchParams();
        const ctx = searchParams.get('ctx') ?? searchParams.get('tab');
        if (ctx) params.set('ctx', ctx);
        void markRead(articleId);
        router.push(`/read/${a.id}${params.toString() ? `?${params.toString()}` : ''}`);
        return;
      }

      fallback?.();
    },
    [articleId, markRead, router, searchParams],
  );

  const readerShortcuts = useMemo(
    () => ({
      arrowleft: () => navigateTo(prev),
      k: () => navigateTo(prev),
      arrowright: () => navigateTo(next),
      j: () => navigateTo(next),
      s: () => {
        if (!article) return;
        void (async () => {
          try {
            const nextStarred = !article.is_starred;
            queryClient.setQueryData(['article', id], { ...article, is_starred: nextStarred });
            await apiFetch(`/api/articles/${id}/state`, {
              method: 'PATCH',
              body: JSON.stringify({ is_starred: nextStarred }),
            });
            broadcast({ type: 'state-change', articleId, is_starred: nextStarred });
          } catch {
            queryClient.setQueryData(['article', id], article);
          }
        })();
      },
      escape: () => {
        const ctx = searchParams.get('ctx') ?? searchParams.get('tab');
        const params = new URLSearchParams();
        if (ctx) params.set('tab', ctx);
        router.push(`/?${params.toString()}`);
      },
    }),
    [article, articleId, id, navigateTo, next, prev, queryClient, router, searchParams],
  );

  useShortcuts(readerShortcuts);

  if (isLoading || !article) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)]">
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  const displayTitle = ai?.title_translated || article.title_translated || article.title;
  const originalTitle = article.title;
  const isNative = article.language.toLowerCase().startsWith(nativeLanguage.toLowerCase().slice(0, 2));
  const showOriginal = !isNative && displayTitle !== originalTitle;
  const summary = ai?.summary || article.summary || '';

  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      <ReaderHeader
        article={{ ...article, title_translated: displayTitle }}
        nativeLanguage={nativeLanguage}
        position={position}
        total={total}
        onBack={() => {
          const ctx = searchParams.get('ctx') ?? searchParams.get('tab');
          const params = new URLSearchParams();
          if (ctx) params.set('tab', ctx);
          router.push(`/?${params.toString()}`);
        }}
        onToggleStar={async () => {
          try {
            const nextStarred = !article.is_starred;
            queryClient.setQueryData(['article', id], { ...article, is_starred: nextStarred });
            await apiFetch(`/api/articles/${id}/state`, {
              method: 'PATCH',
              body: JSON.stringify({ is_starred: nextStarred }),
            });
            broadcast({ type: 'state-change', articleId, is_starred: nextStarred });
          } catch {
            queryClient.setQueryData(['article', id], article);
          }
        }}
      />

      <HighlightLayer articleId={articleId}>
        <article className="mx-auto max-w-[680px] px-5 pb-6 pt-9 font-serif text-[var(--text-body)] md:px-12">
          <h1 className="mb-1.5 text-[32px] font-bold leading-[1.25]">{displayTitle}</h1>
          {showOriginal ? (
            <div className="mb-1.5 font-[system-ui] text-[13px] italic text-[var(--text-muted)]">{originalTitle}</div>
          ) : null}
          <div className="mb-6 font-[system-ui] text-[13px] text-[var(--text-muted)]">
            {article.author && `${article.author} · `}
            {article.published_at && new Date(article.published_at).toLocaleString()}
          </div>

          {summary ? <KeyPointsCallout text={summary} /> : null}

          {article.content_html ? (
            <BilingualBody
              articleId={article.id}
              contentHtml={article.content_html}
              language={article.language}
              nativeLanguage={nativeLanguage}
            />
          ) : (
            <p className="text-base leading-[1.8] text-[var(--text-body)]">{article.content_text}</p>
          )}

          {next ? <NextUpCard next={next} currentId={article.id} markRead={markRead} /> : null}

          <div className="mt-8 text-center font-[system-ui] text-xs text-[var(--text-faint)]">— 文末 —</div>
        </article>
      </HighlightLayer>

      <PrevNextBar
        current={article}
        prev={prev}
        next={next}
        position={position}
        total={total}
        markRead={markRead}
      />
    </div>
  );
}

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)]">
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        </div>
      }
    >
      <ReaderContent id={id} />
    </Suspense>
  );
}
