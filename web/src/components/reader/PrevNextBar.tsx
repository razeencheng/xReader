'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { getDisplayTitle } from '@/lib/article-meta';
import { useI18n } from '@/lib/i18n';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

interface Props {
  current: ArticleItem | null;
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

function NavCard({
  article,
  direction,
  hotkey,
  align = 'left',
  onClick,
}: {
  article: ArticleItem;
  direction: string;
  hotkey: string;
  align?: 'left' | 'right';
  onClick: () => void;
}) {
  const { t } = useI18n();
  const sourceColor = getSourceColor(article.source_title);
  const alignment = align === 'right' ? 'items-end text-right' : 'items-start text-left';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-[var(--border-light)] bg-[var(--bg-panel)] px-3 py-3 transition-all hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[var(--bg)] ${align === 'right' ? 'justify-end' : ''}`}
    >
      {align === 'left' ? (
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-hover)] text-[12px] font-semibold text-[var(--text-3)] transition-colors group-hover:bg-[var(--accent-bg)] group-hover:text-[var(--accent)] md:inline-flex">
          {hotkey}
        </span>
      ) : null}

      <div className={`min-w-0 flex flex-1 flex-col ${alignment}`}>
        <div className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-3)]">{direction}</div>
        <div className="mb-1 flex max-w-full items-center gap-2 text-[11px] text-[var(--text-3)]">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sourceColor }} />
          <span className="truncate">{article.source_title || t('common.source')}</span>
        </div>
        <div className="w-full truncate font-medium text-[var(--text-body)]">{getDisplayTitle(article)}</div>
      </div>

      {align === 'right' ? (
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-hover)] text-[12px] font-semibold text-[var(--text-3)] transition-colors group-hover:bg-[var(--accent-bg)] group-hover:text-[var(--accent)] md:inline-flex">
          {hotkey}
        </span>
      ) : null}
    </button>
  );
}

export function PrevNextBar({ current, prev, next, position, total, markRead }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = async (article: ArticleItem) => {
    if (current) {
      try {
        await markRead(current.id);
      } catch {
        // Keep navigation responsive even if the background mark-read call fails.
      }
    }

    router.push(buildHref(article.id, searchParams));
  };

  return (
    <div className="sticky bottom-0 z-20 block border-t border-[var(--border-light)] bg-[color-mix(in_srgb,var(--bg-body)_92%,transparent)] px-3 pb-[max(16px,calc(env(safe-area-inset-bottom)+12px))] pt-3 font-sans text-[13px] text-[var(--text-body)] backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        {prev ? (
          <NavCard article={prev} direction={t('reader.previousArticle')} hotkey="← K" onClick={() => navigate(prev)} />
        ) : null}

        <div className="shrink-0 px-2 text-center">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--text-3)]">{t('reader.position')}</div>
          <div className="mt-1 text-[12px] text-[var(--text-2)]">{position != null && total != null ? `${position} / ${total}` : ''}</div>
        </div>

        {next ? (
          <NavCard article={next} direction={t('reader.nextArticle')} hotkey="J →" align="right" onClick={() => navigate(next)} />
        ) : null}
      </div>
    </div>
  );
}
