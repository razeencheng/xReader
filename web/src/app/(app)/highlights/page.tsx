'use client';

import { Suspense } from 'react';
import { HighlightsList } from '@/components/highlights/HighlightsList';

export default function HighlightsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-[var(--text-body)]">
      <h1 className="mb-6 text-xl font-semibold text-[var(--text-body)]">我的高亮</h1>
      <Suspense fallback={<div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>}>
        <HighlightsList />
      </Suspense>
    </div>
  );
}
