'use client';

import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';

const DENSITY_OPTIONS = [
  { key: 'comfortable', labelKey: 'settings.densityComfortable' },
  { key: 'compact', labelKey: 'settings.densityCompact' },
] as const;

export function DensityToggle() {
  const { t } = useI18n();
  const density = useUIStore((state) => state.density);
  const setDensity = useUIStore((state) => state.setDensity);

  return (
    <div className="inline-flex rounded-[14px] bg-[var(--border-default)]/80 p-[3px] text-[12px] leading-none">
      {DENSITY_OPTIONS.map(({ key, labelKey }) => {
        const active = density === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => setDensity(key)}
            aria-pressed={active}
            className={`min-h-11 rounded-[10px] px-3 py-1.5 transition-colors ${
              active
                ? 'bg-[var(--bg-body)] font-semibold text-[var(--text-body)] shadow-sm'
                : 'text-[var(--text-muted)] opacity-75 hover:text-[var(--text-secondary)]'
            }`}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
