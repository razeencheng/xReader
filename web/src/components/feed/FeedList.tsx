'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInView } from 'react-intersection-observer';
import { useArticles } from '@/lib/queries/articles';
import type { ArticleItem, ArticleTab } from '@/lib/types';

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function FeedRowPlaceholder({ item }: { item: ArticleItem }) {
  return <div className="px-4 py-5 text-[15px] leading-6 text-[#1f1f1f]">{item.title}</div>;
}

export function FeedList() {
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get('tab'));
  const isStreamTab = tab === 'stream';

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useArticles(tab);
  const { ref, inView } = useInView({
    skip: !isStreamTab,
    rootMargin: '200px 0px',
  });

  useEffect(() => {
    if (!isStreamTab || !inView || !hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage, isStreamTab]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading && items.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-[#8a8275]">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-[#8a8275]">
        还没有订阅任何源 ·{' '}
        <a href="/sources" className="underline underline-offset-4 hover:text-[#4a4338]">
          立刻添加一个
        </a>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#ece6d8]">
      {items.map((item) => (
        <FeedRowPlaceholder key={item.id} item={item} />
      ))}
      {isStreamTab ? <div ref={ref} className="h-10" /> : null}
      {isFetchingNextPage ? (
        <div className="py-4 text-center text-xs text-[#8a8275]">Loading more…</div>
      ) : null}
    </div>
  );
}
