'use client';

import { Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { estimateReadMinutes, formatRelativeTime, getDisplayTitle, getOriginalTitle } from '@/lib/article-meta';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

interface Props {
  item: ArticleItem & { is_starred?: boolean; is_read?: boolean };
  selected?: boolean;
  onClick?: () => void;
  onStar?: (id: number) => void;
}

export function FeedRowComfortable({ item, selected = false, onClick, onStar }: Props) {
  const displayTitle = getDisplayTitle(item);
  const originalTitle = getOriginalTitle(item);
  const relativeTime = formatRelativeTime(item.published_at);
  const readMinutes = estimateReadMinutes(item);
  const sourceName = (item.source_title?.trim() || 'Untitled Source').toUpperCase();
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
      className={`group relative cursor-pointer border-b border-[var(--border-light)] px-4 py-3 transition-[background,opacity] duration-150 ${
        selected ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'
      } ${item.is_read && !selected ? 'opacity-[0.48]' : 'opacity-100'}`}
    >
      {selected ? (
        <motion.div
          layoutId="active-article-indicator"
          className="absolute inset-y-[22%] left-0 w-[2.5px] rounded-r bg-[var(--accent)]"
        />
      ) : null}

      <div className="mb-[5px] flex items-center gap-[5px]">
        <span className="inline-block h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: sourceColor }} />
        <span className="flex-1 truncate text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--text-3)]">
          {sourceName}
        </span>
        {relativeTime ? <span className="text-[11px] text-[var(--text-3)]">{relativeTime}</span> : null}
      </div>

      <h3 className="text-[14px] font-semibold leading-[1.38] text-[var(--text)]">{displayTitle}</h3>

      {originalTitle ? (
        <p className="mt-[3px] text-[11.5px] italic leading-[1.35] text-[var(--text-3)]">{originalTitle}</p>
      ) : null}

      <div className="mt-1 flex items-center">
        {readMinutes ? <span className="text-[11px] text-[var(--text-3)]">{readMinutes} min read</span> : <span />}
        <div className="flex-1" />
        {onStar ? (
          <button
            type="button"
            aria-label={item.is_starred ? 'Unstar article' : 'Star article'}
            onClick={(event) => {
              event.stopPropagation();
              onStar(item.id);
            }}
            className={`rounded p-[3px] transition-[opacity,color] duration-150 ${
              item.is_starred
                ? 'text-[var(--star)] opacity-100'
                : 'text-[var(--text-3)] opacity-0 hover:text-[var(--star)] group-hover:opacity-100'
            }`}
          >
            <Star size={13} fill={item.is_starred ? 'currentColor' : 'none'} strokeWidth={item.is_starred ? 0 : 1.8} />
          </button>
        ) : item.is_starred ? (
          <Star size={13} className="text-[var(--star)]" fill="currentColor" strokeWidth={0} />
        ) : null}
      </div>
    </article>
  );
}
