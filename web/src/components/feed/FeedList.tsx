'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
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

const READ_FILTERS: Array<{ id: ReadFilter; label: string }> = [
  { id: 'unread', label: 'Unread' },
  { id: 'all', label: 'All' },
  { id: 'read', label: 'Read' },
];

interface FeedListProps {
  onOpenArticle?: (article: ArticleItem) => void;
  selectedArticleId?: number | null;
}

export function FeedList({ onOpenArticle, selectedArticleId = null }: FeedListProps) {
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

  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);


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
    if (readFilter === 'unread') return items.filter((item) => !item.is_read);
    if (readFilter === 'read') return items.filter((item) => item.is_read);
    return items;
  }, [currentView, items, readFilter]);

  const externalIndex = selectedArticleId == null ? -1 : filteredItems.findIndex((item) => item.id === selectedArticleId);
  const activeIndex =
    externalIndex >= 0 ? externalIndex : filteredItems.length === 0 ? -1 : Math.min(selectedIndex, filteredItems.length - 1);

  const RowComponent = density === 'compact' ? FeedRowCompact : FeedRowComfortable;
  const headerLabel =
    currentView === 'today'
      ? 'Today'
      : currentView === 'starred'
        ? 'Starred'
        : currentView === 'sources'
          ? selectedSource?.title ?? 'All Sources'
          : 'All';
  const showReadFilters = currentView !== 'starred';
  const sourceColor = selectedSource ? getSourceColor(selectedSource) : null;

  return (
    <div className="flex h-full w-[300px] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg)]">
      <header className="shrink-0 border-b border-[var(--border-light)] px-3 pb-2 pt-[10px]">
        {currentView === 'sources' && selectedSource ? (
          <button
            type="button"
            onClick={() => setCurrentView('sources', null)}
            className="flex items-center gap-1 pb-[6px] text-[11.5px] text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
          >
            <ChevronLeft size={13} />
            All Sources
          </button>
        ) : null}

        <div className={`flex items-center gap-[7px] ${showReadFilters ? 'mb-[7px]' : ''}`}>
          {sourceColor ? <span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ backgroundColor: sourceColor }} /> : null}
          <span className="text-[14px] font-semibold text-[var(--text)]">{headerLabel}</span>
        </div>

        {showReadFilters ? (
          <div className="flex gap-0.5">
            {READ_FILTERS.map(({ id, label }) => {
              const active = readFilter === id;
              const count = counts[id];

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReadFilter(id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11.5px] transition-colors ${
                    active
                      ? 'bg-[var(--accent-bg)] font-semibold text-[var(--accent)]'
                      : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {label}
                  <span className="text-[10px] opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          density === 'compact' ? <CompactSkeleton /> : <FeedSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className="px-7 py-10 text-center text-[13px] text-[var(--text-3)]">
            {readFilter === 'unread' ? 'All caught up ✓' : 'Nothing here yet'}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredItems.map((item, index) => (
              <RowComponent
                key={item.id}
                item={item as FeedArticleItem}
                selected={index === activeIndex}
                onClick={() => {
                  setSelectedIndex(index);
                  onOpenArticle?.(item);
                }}
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
