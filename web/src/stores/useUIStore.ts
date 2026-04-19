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

function readStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(`xreader:${key}`);
  } catch {
    return null;
  }
}

function persist(key: string, value: string) {
  localStorage.setItem(`xreader:${key}`, value);
  apiFetch('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ [`${key}_pref`]: value }),
  }).catch(() => {});
}

function persistLocal(key: string, value: string) {
  localStorage.setItem(`xreader:${key}`, value);
}

export const useUIStore = create<UIState>((set, get) => ({
  density: (readStoredValue('density') as Density) || 'comfortable',
  theme: (readStoredValue('theme') as Theme) || 'system',
  nativeLanguage: readStoredValue('nativeLanguage') || 'zh-CN',

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
    if (prefs.density_pref) {
      update.density = prefs.density_pref as Density;
      persistLocal('density', prefs.density_pref);
    }
    if (prefs.theme_pref) {
      update.theme = prefs.theme_pref as Theme;
      persistLocal('theme', prefs.theme_pref);
    }
    if (prefs.native_language) {
      update.nativeLanguage = prefs.native_language;
      persistLocal('nativeLanguage', prefs.native_language);
    }
    set(update);
  },
}));
