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
      <div className="flex min-h-screen items-center justify-center bg-[#fbfaf7]">
        <p className="text-sm text-[#8a8275]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf6] text-[#1f1f1f]">
      <div className="border-b border-[#ece6d8] bg-[#fdfbf6]/95">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-[#1f1f1f]">
            xReader
          </Link>
          <nav className="flex items-center gap-4 font-[system-ui] text-sm text-[#8a8275]">
            <Link href="/sources" className="transition-colors hover:text-[#1f1f1f]">
              订阅源
            </Link>
            <Link href="/settings" className="transition-colors hover:text-[#1f1f1f]">
              设置
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
