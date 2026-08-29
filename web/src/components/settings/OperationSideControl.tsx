'use client';

import { useI18n } from '@/lib/i18n';
import { useUIStore, type OperationSide } from '@/stores/useUIStore';

interface OperationSideControlProps {
  onSelected?: () => void;
  className?: string;
}

const SIDES: OperationSide[] = ['left', 'right'];

export function OperationSideControl({ onSelected, className = '' }: OperationSideControlProps) {
  const { t } = useI18n();
  const operationSide = useUIStore((state) => state.operationSide);
  const setOperationSide = useUIStore((state) => state.setOperationSide);

  const handleSelect = (side: OperationSide) => {
    if (side === operationSide) return;
    setOperationSide(side);
    onSelected?.();
  };

  return (
    <section className={`md:hidden ${className}`.trim()}>
      <div className="text-[13px] font-semibold text-[var(--text-1)]">{t('operationSide.title')}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
        {t('operationSide.description')}
      </p>
      <div
        role="group"
        aria-label={t('operationSide.title')}
        className="mt-3 grid grid-cols-2 gap-2"
      >
        {SIDES.map((side) => {
          const selected = side === operationSide;
          return (
            <button
              key={side}
              type="button"
              aria-pressed={selected}
              onClick={() => handleSelect(side)}
              className={`${selected ? 'ui-pill-active' : 'ui-pill-neutral'} min-h-11 min-w-11 w-full px-3 py-2`}
            >
              {t(`operationSide.${side}`)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
