'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { estimateReadMinutes, formatRelativeTime, getDisplayTitle, getOriginalTitle } from '@/lib/article-meta';
import { getSourceColor } from '@/lib/source-meta';
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

function langLabel(lang?: string) {
  if (!lang) return null;
  const map: Record<string, string> = { en: 'EN', ja: 'JA', zh: '中', 'zh-cn': '中', ko: 'KO' };
  return map[lang.toLowerCase()] ?? lang.slice(0, 2).toUpperCase();
}

export function NextUpCard({ next, currentId, markRead }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayTitle = getDisplayTitle(next);
  const originalTitle = getOriginalTitle(next);
  const publishedAt = formatRelativeTime(next.published_at);
  const readMinutes = estimateReadMinutes(next);
  const summary = next.summary?.trim();
  const sourceColor = getSourceColor(next.source_title);
  const meta = [publishedAt ? `${publishedAt} ago` : null, readMinutes ? `${readMinutes} min read` : null, langLabel(next.language)]
    .filter(Boolean)
    .join(' · ');

  const handleClick = async () => {
    try {
      await markRead(currentId);
    } catch {
      // Keep navigation responsive even if the background mark-read call fails.
    }

    router.push(buildHref(next.id, searchParams));
  };

  return (
    <div className="mx-auto mb-10 max-w-[680px] px-5 font-sans md:px-12">
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-start gap-4 rounded-[16px] border border-[var(--border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(247,243,236,0.98)_100%)] p-5 text-left shadow-[0_18px_50px_rgba(65,52,35,0.08)] transition-all hover:-translate-y-[1px] hover:border-[var(--accent)] hover:shadow-[0_22px_60px_rgba(65,52,35,0.12)]"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--bg-nav)] text-lg font-bold text-[var(--text-inverse)] transition-transform group-hover:translate-x-[2px]">
          J
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[var(--text-3)]">
            <span>下一篇</span>
            <span className="text-[var(--border-strong)]">·</span>
            <span>按 J 或点击继续</span>
          </div>
          <div className="mb-1 font-serif text-[23px] font-semibold leading-[1.24] tracking-[-0.02em] text-[var(--text-body)]">{displayTitle}</div>
          {originalTitle ? (
            <div className="mb-2 font-serif text-[15px] italic leading-[1.45] text-[var(--text-3)]">{originalTitle}</div>
          ) : null}
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-3)]">
            <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.82)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sourceColor }} />
              {next.source_title || 'Source'}
            </span>
            {meta ? <span>{meta}</span> : null}
          </div>
          {summary ? (
            <div className="border-t border-[var(--border-light)] pt-3 text-[13px] leading-6 text-[var(--text-2)]">
              <span className="mr-2 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-3)]">要点</span>
              {summary}
            </div>
          ) : null}
        </div>
      </button>
    </div>
  );
}
