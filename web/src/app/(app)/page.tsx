'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { DensityToggle } from '@/components/feed/DensityToggle';
import { FeedList } from '@/components/feed/FeedList';
import { useUIStore } from '@/stores/useUIStore';

function getNativeLanguageLabel(value: string) {
  if (value === 'zh-CN') {
    return '中文（简体）';
  }

  if (value === 'en') {
    return 'English';
  }

  return value;
}

function FeedPageContent() {
  const nativeLanguage = useUIStore((state) => state.nativeLanguage);

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#1f1f1f]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-b border-[#ece6d8] px-4 py-3">
        <FeedTabs />
        <div className="flex items-center gap-3 text-[13px] leading-none text-[#8a8275]">
          <span>母语：{getNativeLanguageLabel(nativeLanguage)}</span>
          <DensityToggle />
          <Link href="/settings" className="hover:text-[#1f1f1f]" aria-label="设置">
            ⚙
          </Link>
        </div>
      </div>
      <FeedList />
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageContent />
    </Suspense>
  );
}
