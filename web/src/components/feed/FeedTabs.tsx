'use client';

import { useSearchParams, useRouter } from 'next/navigation';

const TABS = [
  { key: 'today', label: '今日' },
  { key: 'stream', label: '全部' },
  { key: 'starred', label: '收藏' },
] as const;

export function FeedTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get('tab') ?? 'today';

  return (
    <div className="flex gap-1">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => router.push(`/?tab=${key}`)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            currentTab === key
              ? 'bg-[#1f1f1f] text-white'
              : 'text-[#8a8275] hover:text-[#4a4338] hover:bg-[#f5f0e8]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
