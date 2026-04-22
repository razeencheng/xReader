'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useBroadcastSync } from '@/hooks/useBroadcastSync';
import { useCrossDevicePoll } from '@/hooks/useCrossDevicePoll';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

import { Sidebar } from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, fetchMe } = useAuthStore();
  const hydrate = useUIStore((state) => state.hydrate);
  const focusMode = useUIStore((state) => state.focusMode);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!user) return;
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
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-sm font-medium tracking-wider text-[var(--text-muted)]">载入中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-body)] text-[var(--text-body)]">
      <motion.div
        animate={{ width: focusMode ? 0 : 52, opacity: focusMode ? 0 : 1 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="hidden shrink-0 overflow-hidden md:flex"
        style={{ pointerEvents: focusMode ? 'none' : 'auto' }}
      >
        <Sidebar className="shrink-0" />
      </motion.div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <header className="glass-effect sticky top-0 z-30 flex h-14 shrink-0 items-center px-4 md:hidden">
          <Link href="/" className="font-serif text-xl font-bold italic tracking-tight text-[var(--accent)]">
            x
          </Link>
        </header>

        <main className="h-full overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
