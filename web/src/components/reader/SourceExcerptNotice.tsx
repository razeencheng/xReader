import { ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface SourceExcerptNoticeProps {
  link: string;
  error?: string | null;
  isLoading?: boolean;
  onLoadOriginal: () => void;
}

export function SourceExcerptNotice({ error, isLoading = false, link, onLoadOriginal }: SourceExcerptNoticeProps) {
  const { t } = useI18n();

  return (
    <aside className="mb-7 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-callout)] px-4 py-3 font-[system-ui] text-sm leading-6 text-[var(--text-secondary)]">
      <div className="font-medium text-[var(--text-body)]">{t('reader.summaryOnlyTitle')}</div>
      <div className="mt-1">
        {t('reader.summaryOnlyDescription')}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onLoadOriginal}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-nav)] px-3 py-1.5 text-xs font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              {t('reader.loading')}
            </>
          ) : (
            t('reader.loadOriginal')
          )}
        </button>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-body)] px-3 py-1.5 text-xs font-medium text-[var(--text-body)] transition-colors hover:border-[var(--border-accent)] hover:text-[var(--text-accent)]"
        >
          {t('reader.openInNewTab')}
          <ExternalLink size={13} />
        </a>
      </div>
      {error ? <div className="mt-3 text-xs text-[#b42318]">{error}</div> : null}
    </aside>
  );
}
