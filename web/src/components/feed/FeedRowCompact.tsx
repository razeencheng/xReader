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
}

export function FeedRowCompact({ item, onClick }: FeedRowCompactProps) {
  const displayTitle = item.title_translated ?? item.title;
  const starred = (item as ArticleItem & { starred?: boolean }).starred;

  return (
    <div
      onClick={onClick}
      className="flex items-baseline gap-[10px] border-b border-[#ece6d8] py-[10px]"
    >
      <span className="shrink-0 rounded-[8px] bg-[#eee7d8] px-1.5 py-px text-[10px] font-semibold text-[#5b5444]">
        {item.source_title || 'Source'}
      </span>

      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#1f1f1f]">
        {displayTitle}
      </span>

      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-[#8a8275]">
        {timeAgo(item.published_at)}
        {starred ? ' ★' : ''}
      </span>
    </div>
  );
}
