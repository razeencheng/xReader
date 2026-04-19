'use client';

import { create } from 'zustand';
import { apiFetch } from '@/lib/api-client';

export type Density = 'comfortable' | 'compact';
export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  density: Density;
  theme: Theme;
  nativeLanguage: string;
  toggleDensity: () => void;
  setTheme: (t: Theme) => void;
  hydrate: (prefs: { density_pref?: string; theme_pref?: string; native_language?: string }) => void;
}

function persist(key: string, value: string) {
  localStorage.setItem(`xreader:${key}`, value);
  apiFetch('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ [`${key}_pref`]: value }),
  }).catch(() => {});
}

export const useUIStore = create<UIState>((set, get) => ({
  density: (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && localStorage.getItem?.('xreader:density') as Density) || 'comfortable',
  theme: (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && localStorage.getItem?.('xreader:theme') as Theme) || 'system',
  nativeLanguage: 'zh-CN',

  toggleDensity: () => {
    const next = get().density === 'comfortable' ? 'compact' : 'comfortable';
    set({ density: next });
    persist('density', next);
  },

  setTheme: (theme) => {
    set({ theme });
    persist('theme', theme);
  },

  hydrate: (prefs) => {
    const update: Partial<UIState> = {};
    if (prefs.density_pref) update.density = prefs.density_pref as Density;
    if (prefs.theme_pref) update.theme = prefs.theme_pref as Theme;
    if (prefs.native_language) update.nativeLanguage = prefs.native_language;
    set(update);
  },
}));
