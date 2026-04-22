'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/useUIStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const accent = useUIStore((s) => s.accentColor);
  const fontSize = useUIStore((s) => s.fontSize);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove('theme-light', 'theme-dark');
    el.setAttribute('data-accent', accent);
    el.style.setProperty('--font-ui-size', `${fontSize}px`);

    if (theme === 'light') {
      el.classList.add('theme-light');
      return;
    }

    if (theme === 'dark') {
      el.classList.add('theme-dark');
    }
  }, [theme, accent, fontSize]);

  return <>{children}</>;
}
