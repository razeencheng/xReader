'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBroadcastSync } from '@/hooks/useBroadcastSync';
import { useCrossDevicePoll } from '@/hooks/useCrossDevicePoll';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, fetchMe } = useAuthStore();
  const hydrate = useUIStore((state) => state.hydrate);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!user) {
      return;
    }

    hydrate({
      density_pref: user.density_pref,
      theme_pref: user.theme_pref,
      native_language: user.native_language,
    });
  }, [user, hydrate]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, router, user]);

  useCrossDevicePoll(!!user);
  useBroadcastSync();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)]">
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-card)] text-[var(--text-body)]">
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-card)]/95">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-[var(--text-body)]">
            xReader
          </Link>
          <nav className="flex items-center gap-4 font-[system-ui] text-sm text-[var(--text-muted)]">
            <Link href="/sources" className="transition-colors hover:text-[var(--text-body)]">
              订阅源
            </Link>
            <Link href="/settings" className="transition-colors hover:text-[var(--text-body)]">
              设置
            </Link>
            {user.role === 'admin' ? (
              <Link href="/admin" className="transition-colors hover:text-[var(--text-body)]">
                管理
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
