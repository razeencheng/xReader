'use client';

import { Suspense } from 'react';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { FeedList } from '@/components/feed/FeedList';
import { DensityToggle } from '@/components/feed/DensityToggle';
import { useUIStore } from '@/stores/useUIStore';

function FeedPageContent() {
  const nativeLanguage = useUIStore((s) => s.nativeLanguage);

  return (
    <div className="mx-auto max-w-3xl w-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece6d8]">
        <FeedTabs />
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8a8275] bg-[#f5f0e8] px-2 py-0.5 rounded">
            {nativeLanguage}
          </span>
          <DensityToggle />
        </div>
      </div>
      <FeedList />
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}
