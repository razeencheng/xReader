'use client';

import type { ArticleItem } from '@/lib/types';

type FeedArticleItem = ArticleItem & {
  content_text?: string;
};

function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return '0h';
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return '1h';
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function estimateReadTime(item: FeedArticleItem): string {
  const text = [item.title, item.title_translated, item.summary, item.content_text]
    .filter(Boolean)
    .join(' ')
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  return `${Math.max(1, Math.round(words / 200) || 1)}m`;
}

function langTag(language: string): string | null {
  const normalized = language.trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return null;
  }

  const codeMap: Record<string, string> = {
    en: 'EN',
    ja: 'JA',
    ko: 'KO',
    fr: 'FR',
    de: 'DE',
    es: 'ES',
    ru: 'RU',
  };

  const sourceCode = codeMap[normalized] ?? normalized.toUpperCase().slice(0, 2);
  return `${sourceCode} → 中`;
}

interface Props {
  item: ArticleItem;
  onClick?: () => void;
  selected?: boolean;
}

export function FeedRowComfortable({ item, onClick, selected = false }: Props) {
  const article = item as FeedArticleItem;
  const contentText = article.content_text?.trim();
  const summary = article.summary?.trim();
  const translatedTitle = article.title_translated?.trim();
  const hasTranslatedTitle = Boolean(translatedTitle && translatedTitle !== article.title);
  const displayTitle = translatedTitle || article.title;
  const language = langTag(article.language);

  return (
    <article
      className={`border-b border-[var(--border-default)] px-4 py-3 md:px-0 md:py-5 ${onClick ? 'cursor-pointer' : ''} ${selected ? 'bg-[var(--bg-badge-starred)]' : ''}`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-2 text-[12px] text-[var(--text-muted)] md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-[system-ui] md:max-w-[72%]">
          <span className="shrink-0 rounded-[10px] bg-[var(--bg-surface)] px-2 py-px font-semibold text-[var(--text-link)]">
            {article.source_title || 'Source'}
          </span>
          {article.author ? <span className="truncate">{article.author}</span> : null}
          {article.published_at ? <span className="shrink-0">{timeAgo(article.published_at)}</span> : null}
          {language ? <span className="shrink-0">{language}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 font-[system-ui]">
          <span>{estimateReadTime(article)}</span>
          <span className="opacity-50">★</span>
        </div>
      </div>

      <div className="mt-2.5">
        {contentText ? (
          <div className="font-[system-ui] text-[15px] leading-[1.6] text-[var(--text-body)] md:text-[16px]">
            {contentText}
          </div>
        ) : (
          <>
            <h3 className="m-0 mb-1 font-[Iowan Old Style,Georgia,serif] text-[18px] leading-[1.3] text-[var(--text-body)] md:text-[22px]">
              {displayTitle}
            </h3>
            {hasTranslatedTitle ? (
              <div className="mb-2 font-[system-ui] text-xs italic text-[var(--text-muted)]">
                原标题：{article.title}
              </div>
            ) : null}
            {summary ? (
              <div className="font-[system-ui] text-[14px] leading-[1.6] text-[var(--text-secondary)]">
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-muted)]">
                  要点
                </span>
                {summary}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
