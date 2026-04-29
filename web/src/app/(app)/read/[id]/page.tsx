'use client';

import { use, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { broadcast } from '@/lib/broadcast';
import { useI18n } from '@/lib/i18n';
import { useReaderShortcuts } from '@/hooks/useReaderShortcuts';
import { toggleReaderFocusMode } from '@/lib/reader-layout';
import { useUIStore } from '@/stores/useUIStore';
import { useArticleNeighbors } from '@/lib/queries/neighbors';
import { ArticleReader } from '@/components/reader/ArticleReader';
import { PrevNextBar } from '@/components/reader/PrevNextBar';
import { NextUpCard } from '@/components/reader/NextUpCard';
import type { ArticleItem, ArticleTab } from '@/lib/types';

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function ReaderContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const layout = useUIStore((state) => state.layout);
  const setLayout = useUIStore((state) => state.setLayout);
  const focusMode = useUIStore((state) => state.focusMode);
  const setFocusMode = useUIStore((state) => state.setFocusMode);

  const tab = normalizeTab(searchParams.get('ctx') ?? searchParams.get('tab'));
  const articleId = Number(id);

  const { prev, next, position, total } = useArticleNeighbors(articleId, tab);

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

  const handleToggleFocus = useCallback(() => {
    toggleReaderFocusMode(focusMode, layout, setLayout, setFocusMode);
  }, [focusMode, layout, setFocusMode, setLayout]);

  useReaderShortcuts({
    onNext: () => navigateTo(next),
    onPrev: () => navigateTo(prev),
    onToggleStar: undefined,
    onMarkRead: undefined,
    onToggleFocus: handleToggleFocus,
  });

  return (
    <ArticleReader
      id={id}
      onClose={handleBackToList}
      onNext={next ? () => navigateTo(next) : undefined}
      onPrev={prev ? () => navigateTo(prev) : undefined}
      hasNext={Boolean(next)}
      hasPrev={Boolean(prev)}
      position={position}
      total={total}
      afterBody={next ? <NextUpCard next={next} currentId={articleId} markRead={markRead} /> : undefined}
      afterScroll={
        <PrevNextBar
          current={null}
          prev={prev}
          next={next}
          position={position}
          total={total}
          markRead={markRead}
        />
      }
    />
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
