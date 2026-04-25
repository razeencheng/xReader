'use client';

import { motion } from 'framer-motion';
import { formatRelativeTime, getDisplayTitle, getOriginalTitle } from '@/lib/article-meta';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

interface Props {
  item: ArticleItem & { is_read?: boolean; is_starred?: boolean };
  selected?: boolean;
  pendingRead?: boolean;
  onClick?: () => void;
  onMarkRead?: () => void;
  onUndoRead?: () => void;
}

export function FeedRowCompact({ item, selected = false, pendingRead = false, onClick, onMarkRead, onUndoRead }: Props) {
  const sourceName = (item.source_title?.trim() || 'Untitled Source').toUpperCase();
  const relativeTime = formatRelativeTime(item.published_at);
  const displayTitle = getDisplayTitle(item);
  const originalTitle = getOriginalTitle(item);
  const sourceColor = getSourceColor(item.source_title);
  const dimmed = (item.is_read || pendingRead) && !selected;

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
      className={`group relative cursor-pointer border-b border-[var(--border-light)] px-[14px] py-[9px] transition-[background,opacity] duration-150 ${
        selected ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'
      } ${dimmed ? 'opacity-[0.52]' : 'opacity-100'}`}
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
      {pendingRead ? (
        <button
          type="button"
          aria-label="撤销已读"
          onClick={(event) => {
            event.stopPropagation();
            onUndoRead?.();
          }}
          className="mt-[6px] rounded-full bg-[var(--bg-elevated)] px-2 py-[3px] text-[10.5px] font-medium text-[var(--text-3)] shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:text-[var(--accent)]"
        >
          已读 · 撤销
        </button>
      ) : onMarkRead && !item.is_read ? (
        <button
          type="button"
          aria-label="标已读"
          onClick={(event) => {
            event.stopPropagation();
            onMarkRead();
          }}
          className="mt-[6px] rounded-full px-2 py-[3px] text-[10.5px] font-medium text-[var(--text-3)] opacity-0 transition-[background,color,opacity] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)] group-hover:opacity-100 focus:opacity-100"
        >
          标已读
        </button>
      ) : null}
    </article>
  );
}
