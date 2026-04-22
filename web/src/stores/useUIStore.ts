'use client';

import { create } from 'zustand';
import { apiFetch } from '@/lib/api-client';

export type Density = 'comfortable' | 'compact';
export type Theme = 'light' | 'dark' | 'system';
export type Layout = 'classic' | 'focus' | 'wide';
export type AccentColor = 'blue' | 'sage' | 'ember' | 'rose';
export type ReadFilter = 'unread' | 'all' | 'read';
export type ViewTab = 'today' | 'all' | 'starred' | 'sources';

interface UIState {
  density: Density;
  theme: Theme;
  layout: Layout;
  fontSize: number;
  accentColor: AccentColor;
  focusMode: boolean;
  readFilter: ReadFilter;
  currentView: ViewTab;
  selectedSourceId: number | null;
  nativeLanguage: string;

  setDensity: (d: Density) => void;
  toggleDensity: () => void;
  setTheme: (t: Theme) => void;
  setLayout: (l: Layout) => void;
  setFontSize: (s: number) => void;
  setAccentColor: (c: AccentColor) => void;
  setFocusMode: (f: boolean) => void;
  setReadFilter: (f: ReadFilter) => void;
  setCurrentView: (v: ViewTab, sourceId?: number | null) => void;
  setNativeLanguage: (l: string) => void;
  
  hydrate: (prefs: { 
    density_pref?: string; 
    theme_pref?: string; 
    native_language?: string;
  }) => void;
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  if (typeof localStorage.getItem !== 'function') {
    return null;
  }

  try {
    return localStorage.getItem(`xreader:${key}`);
  } catch {
    return null;
  }
}

function persist(key: string, value: unknown) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
    return;
  }

  const valStr = String(value);

  try {
    localStorage.setItem(`xreader:${key}`, valStr);
  } catch {
    return;
  }

  // Prefer server sync for core preferences, local only for UI tweaks for now
  if (['density', 'theme', 'nativeLanguage'].includes(key)) {
    const prefKey = key === 'nativeLanguage' ? 'native_language' : `${key}_pref`;
    apiFetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ [prefKey]: valStr }),
    }).catch(() => {});
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  density: (readStoredValue('density') as Density) || 'comfortable',
  theme: (readStoredValue('theme') as Theme) || 'system',
  layout: (readStoredValue('layout') as Layout) || 'classic',
  fontSize: Number(readStoredValue('fontSize')) || 17,
  accentColor: (readStoredValue('accentColor') as AccentColor) || 'blue',
  focusMode: readStoredValue('focusMode') === 'true',
  readFilter: (readStoredValue('readFilter') as ReadFilter) || 'unread',
  currentView: (readStoredValue('currentView') as ViewTab) || 'today',
  selectedSourceId: readStoredValue('selectedSourceId') ? Number(readStoredValue('selectedSourceId')) : null,
  nativeLanguage: readStoredValue('nativeLanguage') || 'zh-CN',

  setDensity: (density) => {
    set({ density });
    persist('density', density);
  },
  toggleDensity: () => {
    const next = get().density === 'comfortable' ? 'compact' : 'comfortable';
    set({ density: next });
    persist('density', next);
  },
  setTheme: (theme) => {
    set({ theme });
    persist('theme', theme);
  },
  setLayout: (layout) => {
    set({ layout });
    persist('layout', layout);
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    persist('fontSize', fontSize);
  },
  setAccentColor: (accentColor) => {
    set({ accentColor });
    persist('accentColor', accentColor);
  },
  setFocusMode: (focusMode) => {
    set({ focusMode });
    persist('focusMode', focusMode);
  },
  setReadFilter: (readFilter) => {
    set({ readFilter });
    persist('readFilter', readFilter);
  },
  setCurrentView: (currentView, selectedSourceId = null) => {
    set({ currentView, selectedSourceId });
    persist('currentView', currentView);
    if (selectedSourceId !== undefined) {
      persist('selectedSourceId', selectedSourceId === null ? '' : selectedSourceId);
    }
  },
  setNativeLanguage: (nativeLanguage) => {
    set({ nativeLanguage });
    persist('nativeLanguage', nativeLanguage);
  },

  hydrate: (prefs) => {
    const update: Partial<UIState> = {};
    if (prefs.density_pref) update.density = prefs.density_pref as Density;
    if (prefs.theme_pref) update.theme = prefs.theme_pref as Theme;
    if (prefs.native_language) update.nativeLanguage = prefs.native_language;
    set(update);
  },
}));
