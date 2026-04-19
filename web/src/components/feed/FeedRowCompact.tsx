'use client';

import type { ArticleItem } from '@/lib/types';

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';

  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffHours = Math.floor((Date.now() - timestamp) / 3_600_000);
  if (diffHours < 1) return '< 1h';
  if (diffHours < 24) return `${diffHours}h`;

  return `${Math.floor(diffHours / 24)}d`;
}

interface FeedRowCompactProps {
  item: ArticleItem;
  onClick?: () => void;
  selected?: boolean;
}

export function FeedRowCompact({ item, onClick, selected = false }: FeedRowCompactProps) {
  const displayTitle = item.title_translated ?? item.title;
  const starred = (item as ArticleItem & { starred?: boolean }).starred;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 border-b border-[var(--border-default)] px-4 py-2.5 md:px-0 md:py-[10px] ${selected ? 'bg-[var(--bg-badge-starred)]' : ''}`}
    >
      <span className="shrink-0 rounded-[8px] bg-[var(--bg-surface)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-link)]">
        {item.source_title || 'Source'}
      </span>

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.35] text-[var(--text-body)] md:text-[14px]">
        {displayTitle}
      </span>

      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
        {timeAgo(item.published_at)}
        {starred ? ' ★' : ''}
      </span>
    </div>
  );
}
