'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ArticleItem } from '@/lib/types';

interface Props {
  next: ArticleItem;
  currentId: number;
  markRead: (id: number) => void | Promise<void>;
}

function buildHref(articleId: number, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `/read/${articleId}?${query}` : `/read/${articleId}`;
}

function formatPublishedAt(value?: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString();
}

export function NextUpCard({ next, currentId, markRead }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayTitle = next.title_translated || next.title;
  const publishedAt = formatPublishedAt(next.published_at);

  const handleClick = async () => {
    try {
      await markRead(currentId);
    } catch {
      // Keep navigation responsive even if the background mark-read call fails.
    }

    router.push(buildHref(next.id, searchParams));
  };

  return (
    <div className="mx-auto mb-10 max-w-[680px] px-12 font-[system-ui]">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full cursor-pointer items-start gap-[18px] rounded-[10px] border border-[#e6dec8] bg-[#fbf7ec] p-5 text-left transition-colors hover:border-[#d4c9a8]"
      >
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-lg font-bold text-[#fdfbf6]">
          →
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[10px] font-bold tracking-[2px] text-[#8a8275]">
            下一篇 · 按 J 或点击继续
          </div>
          <div className="mb-1 font-serif text-[19px] font-bold leading-[1.3] text-[#1f1f1f]">
            {displayTitle}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8a8275]">
            <span className="rounded-lg bg-[#1d1d1d] px-1.5 py-px font-semibold text-[#fbfaf7]">
              {next.source_title || 'Source'}
            </span>
            {publishedAt ? <span>{publishedAt}</span> : null}
          </div>
        </div>
      </button>
    </div>
  );
}
