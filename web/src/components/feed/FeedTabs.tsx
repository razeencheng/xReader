'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import type { ArticleTab } from '@/lib/types';

const TABS: Array<{ key: ArticleTab; labelKey: string }> = [
  { key: 'today', labelKey: 'nav.today' },
  { key: 'stream', labelKey: 'nav.all' },
  { key: 'starred', labelKey: 'nav.starred' },
];

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

export function FeedTabs() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = normalizeTab(searchParams.get('tab'));

  const handleTabChange = (tab: ArticleTab) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', tab);
    router.replace(`/?${nextParams.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2 text-[13px] leading-none font-normal">
      {TABS.map(({ key, labelKey }) => {
        const active = currentTab === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => handleTabChange(key)}
            className={`min-h-11 rounded-full px-3.5 py-1.5 transition-colors ${
              active
                ? 'bg-[var(--bg-nav)] font-semibold text-[var(--text-inverse)]'
                : 'opacity-55 hover:opacity-80'
            }`}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
