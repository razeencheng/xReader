'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[var(--bg-body)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="font-[system-ui] text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]">
            ← {t('settings.backHome')}
          </Link>
          <div className="font-[system-ui] text-sm text-[var(--text-muted)]">
            {t('settings.breadcrumb')}
          </div>
        </div>

        <header className="mb-8 space-y-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--text-body)]">{t('settings.title')}</h1>
          <p className="max-w-2xl font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">
            {t('settings.description')}
          </p>
        </header>
      </div>
    </main>
  );
}
