'use client';

import { Suspense } from 'react';
import { HighlightsList } from '@/components/highlights/HighlightsList';

export default function HighlightsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold text-[#1f1f1f]">我的高亮</h1>
      <Suspense fallback={<div className="py-8 text-center text-sm text-[#8a8275]">Loading…</div>}>
        <HighlightsList />
      </Suspense>
    </div>
  );
}
