'use client';

import { motion } from 'framer-motion';
import { formatRelativeTime, getDisplayTitle, getOriginalTitle } from '@/lib/article-meta';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

interface Props {
  item: ArticleItem & { is_read?: boolean; is_starred?: boolean };
  selected?: boolean;
  onClick?: () => void;
}

export function FeedRowCompact({ item, selected = false, onClick }: Props) {
  const sourceName = (item.source_title?.trim() || 'Untitled Source').toUpperCase();
  const relativeTime = formatRelativeTime(item.published_at);
  const displayTitle = getDisplayTitle(item);
  const originalTitle = getOriginalTitle(item);
  const sourceColor = getSourceColor(item.source_title);

  return (
    <article
      role="button"
      aria-current={selected ? 'true' : undefined}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`relative cursor-pointer border-b border-[var(--border-light)] px-[14px] py-[9px] transition-[background,opacity] duration-150 ${
        selected ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'
      } ${item.is_read && !selected ? 'opacity-[0.48]' : 'opacity-100'}`}
    >
      {selected ? (
        <motion.div
          layoutId="active-article-indicator"
          className="absolute inset-y-[22%] left-0 w-[2.5px] rounded-r bg-[var(--accent)]"
        />
      ) : null}

      <div className="mb-1 flex items-center gap-[5px]">
        <span className="inline-block h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: sourceColor }} />
        <span className="flex-1 truncate text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--text-3)]">
          {sourceName}
        </span>
        {relativeTime ? <span className="text-[11px] text-[var(--text-3)]">{relativeTime}</span> : null}
      </div>

      <div className="text-[13px] font-semibold leading-[1.38] text-[var(--text)]">{displayTitle}</div>
      {originalTitle ? <div className="mt-[3px] text-[11px] italic leading-[1.35] text-[var(--text-3)]">{originalTitle}</div> : null}
    </article>
  );
}
