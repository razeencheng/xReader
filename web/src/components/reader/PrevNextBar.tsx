'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ArticleItem } from '@/lib/types';

interface Props {
  current: ArticleItem;
  prev: ArticleItem | null;
  next: ArticleItem | null;
  position?: number;
  total?: number;
  markRead: (id: number) => void | Promise<void>;
}

type SearchParamsLike = { toString(): string };

function buildHref(articleId: number, searchParams: SearchParamsLike) {
  const query = searchParams.toString();
  return query ? `/read/${articleId}?${query}` : `/read/${articleId}`;
}

export function PrevNextBar({ current, prev, next, position, total, markRead }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = async (article: ArticleItem) => {
    try {
      await markRead(current.id);
    } catch {
      // Keep navigation responsive even if the background mark-read call fails.
    }

    router.push(buildHref(article.id, searchParams));
  };

  return (
    <div className="sticky bottom-0 z-20 flex items-center gap-4 border-t border-[var(--border-default)] bg-[var(--bg-input)] px-4 py-3 font-[system-ui] text-[13px] text-[var(--text-body)] md:px-6">
      <div className="min-w-0 flex-1">
        {prev ? (
          <button
            type="button"
            onClick={() => navigate(prev)}
            className="flex min-w-0 max-w-[42vw] items-center gap-2.5 text-left opacity-80 transition hover:opacity-100"
          >
            <span className="hide-mobile shrink-0 text-[var(--text-muted)]">← K</span>
            <div className="min-w-0 overflow-hidden">
              <div className="text-[10px] tracking-[1.5px] text-[var(--text-muted)]">上一篇</div>
              <div className="truncate font-medium text-[var(--text-body)]">
                {prev.title_translated || prev.title}
              </div>
            </div>
          </button>
        ) : null}
      </div>

      <div className="shrink-0 px-4 text-[var(--text-muted)]">
        {position != null && total != null ? `${position} / ${total}` : ''}
      </div>

      <div className="min-w-0 flex-1">
        {next ? (
          <button
            type="button"
            onClick={() => navigate(next)}
            className="ml-auto flex min-w-0 max-w-[42vw] items-center gap-2.5 text-right opacity-80 transition hover:opacity-100"
          >
            <div className="min-w-0 overflow-hidden">
              <div className="text-[10px] tracking-[1.5px] text-[var(--text-muted)]">下一篇</div>
              <div className="truncate font-medium text-[var(--text-body)]">
                {next.title_translated || next.title}
              </div>
            </div>
            <span className="hide-mobile shrink-0 text-[var(--text-muted)]">J →</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
