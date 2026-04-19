'use client';

import { useUIStore } from '@/stores/useUIStore';

const DENSITY_OPTIONS = [
  { key: 'comfortable', label: '舒适' },
  { key: 'compact', label: '紧凑' },
] as const;

export function DensityToggle() {
  const density = useUIStore((state) => state.density);
  const toggleDensity = useUIStore((state) => state.toggleDensity);

  return (
    <div className="inline-flex rounded-[14px] bg-[#ece6d8] p-[3px] text-[13px] leading-none">
      {DENSITY_OPTIONS.map(({ key, label }) => {
        const active = density === key;

        return (
          <button
            key={key}
            type="button"
            onClick={toggleDensity}
            aria-pressed={active}
            className={`rounded-[11px] px-3 py-1.5 transition-colors ${
              active
                ? 'bg-[#fbfaf7] font-semibold text-[#1f1f1f]'
                : 'text-[#8a8275] opacity-70 hover:text-[#4a4338]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
