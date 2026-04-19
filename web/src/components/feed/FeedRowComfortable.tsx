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
}

export function FeedRowComfortable({ item, onClick }: Props) {
  const article = item as FeedArticleItem;
  const contentText = article.content_text?.trim();
  const summary = article.summary?.trim();
  const translatedTitle = article.title_translated?.trim();
  const hasTranslatedTitle = Boolean(translatedTitle && translatedTitle !== article.title);
  const displayTitle = translatedTitle || article.title;
  const language = langTag(article.language);

  return (
    <article
      className={`border-b border-[#ece6d8] py-5 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-4 text-[12px] text-[#8a8275]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-[system-ui]">
          <span className="shrink-0 rounded-[10px] bg-[#eee7d8] px-2 py-px font-semibold text-[#5b5444]">
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

      <div className="mt-2">
        {contentText ? (
          <div className="font-[system-ui] text-[15px] leading-[1.6] text-[#1f1f1f]">{contentText}</div>
        ) : (
          <>
            <h3 className="m-0 mb-1 font-[Iowan Old Style,Georgia,serif] text-[22px] leading-[1.3] text-[#1f1f1f]">
              {displayTitle}
            </h3>
            {hasTranslatedTitle ? (
              <div className="mb-2 font-[system-ui] text-xs italic text-[#8a8275]">
                原标题：{article.title}
              </div>
            ) : null}
            {summary ? (
              <div className="font-[system-ui] text-[14px] leading-[1.6] text-[#4a4338]">
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#8a8275]">
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
