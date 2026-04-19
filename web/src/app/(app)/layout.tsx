'use client';

import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useEffect } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, fetchMe } = useAuthStore();
  const hydrate = useUIStore((s) => s.hydrate);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (user) {
      hydrate({
        density_pref: user.density_pref,
        theme_pref: user.theme_pref,
        native_language: user.native_language,
      });
    }
  }, [user, hydrate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#8a8275]">Loading…</p>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return <>{children}</>;
}
