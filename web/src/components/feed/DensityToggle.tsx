'use client';

import { useUIStore } from '@/stores/useUIStore';

const DENSITY_OPTIONS = [
  { key: 'comfortable', label: '舒适' },
  { key: 'compact', label: '紧凑' },
] as const;

export function DensityToggle() {
  const density = useUIStore((state) => state.density);
  const setDensity = useUIStore((state) => state.setDensity);

  return (
    <div className="inline-flex rounded-[14px] bg-[var(--border-default)]/80 p-[3px] text-[12px] leading-none">
      {DENSITY_OPTIONS.map(({ key, label }) => {
        const active = density === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => setDensity(key)}
            aria-pressed={active}
            className={`rounded-[11px] px-3 py-1.5 transition-colors ${
              active
                ? 'bg-[var(--bg-body)] font-semibold text-[var(--text-body)] shadow-sm'
                : 'text-[var(--text-muted)] opacity-75 hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
