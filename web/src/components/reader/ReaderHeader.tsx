import type { ArticleItem } from '@/lib/types';

function langLabel(lang: string): string {
  const map: Record<string, string> = { en: 'EN', ja: 'JA', zh: '中', 'zh-cn': '中', ko: 'KO' };
  return map[lang.toLowerCase()] ?? lang.toUpperCase().slice(0, 2);
}

interface Props {
  article: ArticleItem & {
    content_html?: string;
    content_text?: string;
    is_read?: boolean;
    is_starred?: boolean;
  };
  position?: number;
  total?: number;
  nativeLanguage?: string;
  onBack?: () => void;
  onToggleStar?: () => void;
}

export function ReaderHeader({
  article,
  position,
  total,
  nativeLanguage = 'zh-CN',
  onBack,
  onToggleStar,
}: Props) {
  const isNative = article.language.toLowerCase().startsWith(nativeLanguage.toLowerCase().slice(0, 2));
  const sourceLang = langLabel(article.language);
  const targetLang = langLabel(nativeLanguage);

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border-default)] px-5 py-3 font-[system-ui] text-xs text-[var(--text-muted)] md:flex-row md:items-center md:justify-between md:px-12">
      <button onClick={onBack} className="self-start hover:text-[var(--text-secondary)]">
        ← 返回 Feed
      </button>
      <div className="flex flex-wrap items-center gap-3">
        {position != null && total != null && (
          <span className="opacity-60">{position} / {total}</span>
        )}
        <span className="text-[var(--text-body)]">
          {article.source_title && `📰 ${article.source_title} · `}
          {isNative ? article.language : `${sourceLang} → ${targetLang}`}
        </span>
      </div>
      <div className="flex gap-3.5 self-end md:self-auto">
        <button onClick={onToggleStar} className="hover:text-[var(--text-secondary)]">
          {article.is_starred ? '⭐' : '☆'} 收藏
        </button>
        <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-secondary)]">
          🔗 原文
        </a>
      </div>
    </div>
  );
}
