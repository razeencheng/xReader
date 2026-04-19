'use client';

import { useSearchParams } from 'next/navigation';
import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';
import { useArticles } from '@/lib/queries/articles';
import { useUIStore } from '@/stores/useUIStore';
import { FeedRowComfortable } from './FeedRowComfortable';
import { FeedRowCompact } from './FeedRowCompact';

export function FeedList() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'today';
  const density = useUIStore((s) => s.density);
  const nativeLanguage = useUIStore((s) => s.nativeLanguage);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useArticles(tab);

  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <div className="p-8 text-center text-[#8a8275] text-sm">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-[#8a8275] text-sm">
        还没有订阅任何源 ·{' '}
        <a href="/sources" className="underline hover:text-[#4a4338]">
          立刻添加一个
        </a>
      </div>
    );
  }

  const padding = density === 'comfortable' ? 'px-7' : 'px-7';

  return (
    <div className={padding}>
      {items.map((item) =>
        density === 'comfortable' ? (
          <FeedRowComfortable key={item.id} item={item} nativeLanguage={nativeLanguage} />
        ) : (
          <FeedRowCompact key={item.id} item={item} />
        ),
      )}
      <div ref={ref} className="h-10" />
      {isFetchingNextPage && (
        <div className="py-4 text-center text-xs text-[#8a8275]">Loading more…</div>
      )}
    </div>
  );
}
