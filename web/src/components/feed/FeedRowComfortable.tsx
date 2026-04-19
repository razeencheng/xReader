import type { Article } from '@/lib/types';

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function langTag(language: string, nativeLanguage: string): string | null {
  const lang = language.toUpperCase().slice(0, 2);
  const native = nativeLanguage.toUpperCase().slice(0, 2);
  if (lang === native) return null;
  const displayNative = native === 'ZH' ? '中' : native;
  return `${lang} → ${displayNative}`;
}

interface Props {
  item: Article;
  nativeLanguage?: string;
}

export function FeedRowComfortable({ item, nativeLanguage = 'zh-CN' }: Props) {
  const hasTranslation = item.title_translated && item.title_translated !== item.title;
  const displayTitle = item.title_translated || item.title;
  const tag = langTag(item.language, nativeLanguage);
  const isShort = !item.summary;

  return (
    <article className="py-5 border-b border-[#ece6d8]">
      {/* Metadata row */}
      <div className="flex justify-between font-[system-ui] text-xs text-[#8a8275] mb-2">
        <div className="flex gap-2 items-center">
          <span className="px-2 py-px bg-[#eee7d8] text-[#5b5444] rounded-[10px] font-semibold">
            {item.source_title || 'Source'}
          </span>
          <span>
            {item.author && `${item.author} · `}
            {timeAgo(item.published_at)}
            {tag && ` · ${tag}`}
          </span>
        </div>
      </div>

      {/* Title */}
      {isShort ? (
        <>
          <div className="font-[system-ui] text-[15px] leading-relaxed text-[#2a2a2a] mb-1">
            {displayTitle}
          </div>
          {hasTranslation && (
            <div className="font-[system-ui] text-xs text-[#8a8275] italic">
              原文：{item.title}
            </div>
          )}
        </>
      ) : (
        <>
          <h3 className="m-0 mb-1 text-[22px] leading-[1.3] text-[#1f1f1f] font-serif">
            {displayTitle}
          </h3>
          {hasTranslation && (
            <div className="font-[system-ui] text-xs text-[#8a8275] italic mb-2">
              原标题：{item.title}
            </div>
          )}
          {item.summary && (
            <div className="font-[system-ui] text-sm leading-relaxed text-[#4a4338]">
              <span className="text-[#8a8275] font-semibold text-[11px] tracking-[1.5px] mr-1.5">
                要点
              </span>
              {item.summary}
            </div>
          )}
        </>
      )}
    </article>
  );
}
