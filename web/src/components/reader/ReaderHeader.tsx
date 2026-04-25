import { ArrowLeft, Maximize2, Minimize2, Share2, Star } from 'lucide-react';
import { estimateReadMinutes } from '@/lib/article-meta';
import { useI18n } from '@/lib/i18n';
import { getSourceColor } from '@/lib/source-meta';
import type { ArticleItem } from '@/lib/types';

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
  onToggleFocus?: () => void;
  onShare?: () => void;
  focusMode?: boolean;
  progress?: number;
  isCompact?: boolean;
}

const iconButtonClass =
  'flex h-10 w-10 items-center justify-center rounded-[9px] border-none bg-transparent text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)] md:h-[30px] md:w-[30px] md:rounded-[7px]';

export function ReaderHeader({
  article,
  onBack,
  onToggleStar,
  onToggleFocus,
  onShare,
  focusMode = false,
  progress = 0,
}: Props) {
  const { t } = useI18n();
  const sourceColor = getSourceColor(article.source_title);
  const sourceTitle = article.source_title?.trim() || t('common.source');
  const readMinutes = estimateReadMinutes(article);
  const showReadState = progress > 0.75 || article.is_read;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-light)] bg-[var(--bg)] px-5 py-[9px]">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`${iconButtonClass} mr-1 w-auto gap-1 px-2 md:w-[30px] md:px-0`}
          title={t('reader.back')}
          aria-label={t('reader.backToList')}
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          <span className="text-[12px] font-medium md:hidden">{t('reader.back')}</span>
        </button>
      ) : null}

      <div className="min-w-0 flex-1 overflow-hidden text-[12px] text-[var(--text-3)]">
        <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <span className="inline-block h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: sourceColor }} />
          <span className="truncate font-medium text-[var(--text-2)]">{sourceTitle}</span>
          {readMinutes ? <span>· {t('article.minRead', { count: readMinutes })}</span> : null}
          {showReadState ? <span className="font-medium text-[var(--accent)]">· {t('reader.readState')}</span> : null}
        </div>
      </div>

      {onToggleStar ? (
        <button
          type="button"
          onClick={onToggleStar}
          className={`${iconButtonClass} ${article.is_starred ? 'text-[var(--star)] hover:text-[var(--star)]' : ''}`}
          title={t('reader.star')}
        >
          <Star size={15} fill={article.is_starred ? 'currentColor' : 'none'} strokeWidth={article.is_starred ? 0 : 1.8} />
        </button>
      ) : null}

      {onShare ? (
        <button type="button" onClick={onShare} className={iconButtonClass} title={t('reader.share')}>
          <Share2 size={15} strokeWidth={1.8} />
        </button>
      ) : null}

      {onToggleFocus ? (
        <button
          type="button"
          onClick={onToggleFocus}
          className={`${iconButtonClass} ${focusMode ? 'bg-[var(--accent-bg)] text-[var(--accent)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]' : ''}`}
          title={focusMode ? t('reader.exitFocusMode') : t('reader.focusMode')}
        >
          {focusMode ? <Minimize2 size={15} strokeWidth={1.8} /> : <Maximize2 size={15} strokeWidth={1.8} />}
        </button>
      ) : null}
    </div>
  );
}
