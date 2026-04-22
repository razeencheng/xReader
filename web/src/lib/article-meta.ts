import type { ArticleItem } from '@/lib/types';

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ');
}

export function formatRelativeTime(value?: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  const units: Array<[label: string, size: number]> = [
    ['y', 31_536_000],
    ['mo', 2_592_000],
    ['d', 86_400],
    ['h', 3_600],
    ['m', 60],
  ];

  for (const [label, size] of units) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)}${label}`;
    }
  }

  return `${seconds}s`;
}

export function estimateReadMinutes(
  article: Pick<ArticleItem, 'title' | 'title_translated' | 'summary'> & {
    content_text?: string;
    content_html?: string;
  },
) {
  const content = [
    article.title_translated,
    article.title,
    article.summary,
    article.content_text,
    article.content_html ? stripHtml(article.content_html) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!content) return null;

  const words = content.split(/\s+/).filter(Boolean).length;
  const characters = content.replace(/\s+/g, '').length;
  const estimate = Math.max(words / 220, characters / 420);

  return Math.max(1, Math.round(estimate));
}

export function getDisplayTitle(article: Pick<ArticleItem, 'title' | 'title_translated'>) {
  return article.title_translated?.trim() || article.title;
}

export function getOriginalTitle(article: Pick<ArticleItem, 'title' | 'title_translated'>) {
  const displayTitle = getDisplayTitle(article);
  if (!article.title_translated || displayTitle === article.title) {
    return null;
  }

  return article.title;
}

function normalizeLanguage(value: string) {
  return value.toLowerCase().split('-')[0];
}

export function isSameLanguage(articleLanguage: string, nativeLanguage: string) {
  return normalizeLanguage(articleLanguage) === normalizeLanguage(nativeLanguage);
}
