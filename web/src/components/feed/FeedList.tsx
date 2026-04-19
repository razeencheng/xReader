'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { apiFetch } from '@/lib/api-client';
import { applyArticleStateChange } from '@/lib/article-state-cache';
import { broadcast } from '@/lib/broadcast';
import { useArticles } from '@/lib/queries/articles';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useUIStore } from '@/stores/useUIStore';
import { FeedRowComfortable } from './FeedRowComfortable';
import { FeedRowCompact } from './FeedRowCompact';
import type { ArticleItem, ArticleTab } from '@/lib/types';

type FeedArticleItem = ArticleItem & {
  is_starred?: boolean;
};

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function buildHref(articleId: number, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `/read/${articleId}?${query}` : `/read/${articleId}`;
}

export function FeedList() {
  const density = useUIStore((state) => state.density);
  const toggleDensity = useUIStore((state) => state.toggleDensity);
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tab = normalizeTab(searchParams.get('tab'));
  const isStreamTab = tab === 'stream';
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useArticles(tab);
  const { ref, inView } = useInView({
    skip: !isStreamTab,
    rootMargin: '200px 0px',
  });
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((current) => Math.min(current, items.length - 1));
  }, [items.length]);

  useEffect(() => {
    if (!isStreamTab || !inView || !hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage, isStreamTab]);

  const selectedItem = (items[selectedIndex] ?? null) as FeedArticleItem | null;

  const openArticle = useCallback(
    (article: ArticleItem) => {
      router.push(buildHref(article.id, searchParams));
    },
    [router, searchParams],
  );

  const toggleStar = useCallback(
    async (article: FeedArticleItem) => {
      try {
        const nextStarred = !article.is_starred;
        await apiFetch(`/api/articles/${article.id}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ is_starred: nextStarred }),
        });
        applyArticleStateChange(queryClient, { articleId: article.id, is_starred: nextStarred });
        broadcast({ type: 'state-change', articleId: article.id, is_starred: nextStarred });
      } catch {
        // Ignore failed background mutations.
      }
    },
    [queryClient],
  );

  const focusSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[aria-label*="Search" i], input[placeholder*="Search" i]',
    );

    input?.focus();
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      setSelectedIndex((current) => Math.max(0, Math.min(items.length - 1, current + delta)));
    },
    [items.length],
  );

  const shortcuts = useMemo(
    () => ({
      j: () => moveSelection(1),
      k: () => moveSelection(-1),
      enter: () => {
        if (selectedItem) {
          openArticle(selectedItem);
        }
      },
      s: () => {
        if (selectedItem) {
          void toggleStar(selectedItem);
        }
      },
      c: toggleDensity,
      '/': focusSearch,
    }),
    [focusSearch, moveSelection, openArticle, selectedItem, toggleDensity, toggleStar],
  );

  useShortcuts(shortcuts);

  const RowComponent = density === 'compact' ? FeedRowCompact : FeedRowComfortable;

  if (isLoading && items.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        还没有订阅任何源 ·{' '}
        <a href="/sources" className="underline underline-offset-4 hover:text-[var(--text-secondary)]">
          立刻添加一个
        </a>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border-default)]">
      {items.map((item, index) => (
        <RowComponent
          key={item.id}
          item={item}
          selected={index === selectedIndex}
          onClick={() => {
            setSelectedIndex(index);
            openArticle(item);
          }}
        />
      ))}
      {isStreamTab ? <div ref={ref} className="h-10" /> : null}
      {isFetchingNextPage ? <div className="py-4 text-center text-xs text-[var(--text-muted)]">Loading more…</div> : null}
    </div>
  );
}
