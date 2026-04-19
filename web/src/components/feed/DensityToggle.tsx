'use client';

import { useUIStore } from '@/stores/useUIStore';

export function DensityToggle() {
  const { density, toggleDensity } = useUIStore();

  return (
    <button
      onClick={toggleDensity}
      className="text-xs text-[#8a8275] hover:text-[#4a4338] px-2 py-1 rounded border border-[#ece6d8]"
      title={density === 'comfortable' ? '切换到紧凑模式' : '切换到舒适模式'}
    >
      {density === 'comfortable' ? '舒适' : '紧凑'}
    </button>
  );
}
