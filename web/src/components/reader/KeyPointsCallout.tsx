import { useI18n } from '@/lib/i18n';
import { parseSummary } from '@/lib/summary';

interface Props {
  text: string;
  locale?: string;
}

export function KeyPointsCallout({ text, locale }: Props) {
  const { t, nativeLanguage } = useI18n();
  if (!text) return null;

  const summary = parseSummary(text, locale || nativeLanguage);

  return (
    <div className="mb-[30px] rounded-r-[10px] border-l-[3px] border-[var(--accent)] bg-[var(--callout-bg)] px-[18px] py-4">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-3)]">
        {t('reader.keyPoints')}：
      </div>
      {summary.kind === 'structured' ? (
        <>
          <p className="mb-3 text-[0.95em] font-medium leading-relaxed text-[var(--text-body)]">{summary.lead}</p>
          <ul className="pl-5 text-[0.9em] leading-relaxed text-[var(--text-2)]">
            {summary.points.map((point, index) => (
              <li key={index} className="mb-[5px]">
                {point}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-2 text-[0.9em] leading-relaxed text-[var(--text-2)]">
          {summary.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      )}
    </div>
  );
}
