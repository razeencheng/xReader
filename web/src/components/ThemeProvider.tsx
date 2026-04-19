'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/useUIStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove('theme-light', 'theme-dark');

    if (theme === 'light') {
      el.classList.add('theme-light');
      return;
    }

    if (theme === 'dark') {
      el.classList.add('theme-dark');
    }
  }, [theme]);

  return <>{children}</>;
}
