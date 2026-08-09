'use client';

import { useEffect, useRef } from 'react';
import { estimateReadMinutes, formatRelativeTime, getDisplayTitle, getOriginalTitle } from '@/lib/article-meta';
import { useI18n } from '@/lib/i18n';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

interface Props {
  next: ArticleItem;
  onAdvance: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

function langLabel(lang?: string) {
  if (!lang) return null;
  const map: Record<string, string> = { en: 'EN', ja: 'JA', zh: '中', 'zh-cn': '中', ko: 'KO' };
  return map[lang.toLowerCase()] ?? lang.slice(0, 2).toUpperCase();
}

export function NextUpCard({ next, onAdvance, onVisibilityChange }: Props) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const displayTitle = getDisplayTitle(next);
  const originalTitle = getOriginalTitle(next);
  const publishedAt = formatRelativeTime(next.published_at);
  const readMinutes = estimateReadMinutes(next);
  const sourceColor = getSourceColor(next.source_title);
  const meta = [
    publishedAt ? t('article.ago', { time: publishedAt }) : null,
    readMinutes ? t('article.minRead', { count: readMinutes }) : null,
    langLabel(next.language),
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    const element = cardRef.current;
    if (!element || !onVisibilityChange || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => onVisibilityChange(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      onVisibilityChange(false);
    };
  }, [onVisibilityChange]);

  return (
    <div ref={cardRef} className="mb-7 font-sans">
      <button
        type="button"
        onClick={onAdvance}
        className="group w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-callout)] px-4 py-3 text-left text-sm leading-6 text-[var(--text-secondary)] transition-all hover:-translate-y-[1px] hover:border-[var(--accent)]"
      >
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[var(--text-3)]">
            <span>{t('reader.nextArticle')}</span>
            <span className="text-[var(--border-strong)]">·</span>
            <span>{t('reader.pressNext')}</span>
          </div>
          <div className="mb-1 font-serif text-[23px] font-semibold leading-[1.24] tracking-[-0.02em] text-[var(--text-body)]">{displayTitle}</div>
          {originalTitle ? (
            <div className="mb-2 font-serif text-[15px] italic leading-[1.45] text-[var(--text-3)]">{originalTitle}</div>
          ) : null}
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-3)]">
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sourceColor }} />
              {next.source_title || t('common.source')}
            </span>
            {meta ? <span>{meta}</span> : null}
          </div>
        </div>
      </button>
    </div>
  );
}
