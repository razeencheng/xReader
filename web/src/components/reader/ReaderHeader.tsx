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
    <div className="flex items-center justify-between border-b border-[#ece6d8] px-12 py-3 font-[system-ui] text-xs text-[#8a8275]">
      <button onClick={onBack} className="hover:text-[#4a4338]">
        ← 返回 Feed
      </button>
      <div className="flex items-center gap-3">
        {position != null && total != null && (
          <span className="opacity-60">{position} / {total}</span>
        )}
        <span>
          {article.source_title && `📰 ${article.source_title} · `}
          {isNative ? article.language : `${sourceLang} → ${targetLang}`}
        </span>
      </div>
      <div className="flex gap-3.5">
        <button onClick={onToggleStar} className="hover:text-[#4a4338]">
          {article.is_starred ? '⭐' : '☆'} 收藏
        </button>
        <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-[#4a4338]">
          🔗 原文
        </a>
      </div>
    </div>
  );
}
