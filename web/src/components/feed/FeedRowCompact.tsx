import type { Article } from '@/lib/types';

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface Props {
  item: Article;
}

export function FeedRowCompact({ item }: Props) {
  const displayTitle = item.title_translated || item.title;

  return (
    <div
      className="py-2 border-b border-[#ece6d8] flex gap-2.5 items-baseline"
      title={item.summary || undefined}
    >
      <span className="px-1.5 py-px bg-[#eee7d8] text-[#5b5444] rounded-lg text-[10px] font-semibold shrink-0">
        {item.source_title || 'Source'}
      </span>
      <span className="text-sm text-[#1f1f1f] font-medium flex-1 truncate">
        {displayTitle}
      </span>
      <span className="text-[11px] text-[#8a8275] shrink-0 ml-auto">
        {timeAgo(item.published_at)}
      </span>
    </div>
  );
}
