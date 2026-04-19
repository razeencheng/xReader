'use client';

import { useEffect } from 'react';
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

  return <>{children}</>;
}
