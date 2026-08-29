'use client';

import { create } from 'zustand';
import { apiFetch } from '@/lib/api-client';

export type Density = 'comfortable' | 'compact';
export type Theme = 'light' | 'dark' | 'system';
export type Layout = 'classic' | 'focus' | 'wide';
export type AccentColor = 'blue' | 'sage' | 'ember' | 'rose';
export type ReadFilter = 'unread' | 'all' | 'read';
export type ViewTab = 'today' | 'all' | 'starred' | 'sources';
export type OperationSide = 'left' | 'right';

export interface SourceImportJob {
  id: string;
  fileName: string;
  startedAt: number;
}

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
  isShortcutsOpen: boolean;
  operationSide: OperationSide;
  operationSideNotice: OperationSide | null;
  sourceImportJob: SourceImportJob | null;
  _hydrated: boolean;

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
  openShortcuts: () => void;
  closeShortcuts: () => void;
  setOperationSide: (side: OperationSide) => void;
  clearOperationSideNotice: () => void;
  startSourceImport: (jobId: string, fileName: string) => void;
  clearSourceImport: () => void;

  hydrate: (prefs: {
    density_pref?: string;
    theme_pref?: string;
    native_language?: string;
  }) => void;
  hydrateFromLocalStorage: () => void;
}

// --- Validation helpers ---
const validDensities: readonly Density[] = ['comfortable', 'compact'];
const isValidDensity = (v: unknown): v is Density => validDensities.includes(v as Density);

const validThemes: readonly Theme[] = ['light', 'dark', 'system'];
const isValidTheme = (v: unknown): v is Theme => validThemes.includes(v as Theme);

const validLayouts: readonly Layout[] = ['classic', 'focus', 'wide'];
const isValidLayout = (v: unknown): v is Layout => validLayouts.includes(v as Layout);

const validAccentColors: readonly AccentColor[] = ['blue', 'sage', 'ember', 'rose'];
const isValidAccentColor = (v: unknown): v is AccentColor => validAccentColors.includes(v as AccentColor);

const validReadFilters: readonly ReadFilter[] = ['unread', 'all', 'read'];
const isValidReadFilter = (v: unknown): v is ReadFilter => validReadFilters.includes(v as ReadFilter);

const validViewTabs: readonly ViewTab[] = ['today', 'all', 'starred', 'sources'];
const isValidViewTab = (v: unknown): v is ViewTab => validViewTabs.includes(v as ViewTab);

const validOperationSides: readonly OperationSide[] = ['left', 'right'];
const isValidOperationSide = (v: unknown): v is OperationSide => validOperationSides.includes(v as OperationSide);

function isValidFontSize(v: unknown): v is number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 10 && n <= 32;
}

function readStoredValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (typeof storage.getItem !== 'function') {
      return null;
    }
    return storage.getItem(`xreader:${key}`);
  } catch {
    return null;
  }
}

function persist(key: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  const valStr = String(value);

  try {
    const storage = window.localStorage;
    if (typeof storage.setItem !== 'function') {
      return;
    }
    storage.setItem(`xreader:${key}`, valStr);
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

function removeStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storage = window.localStorage;
    if (typeof storage.removeItem !== 'function') {
      return;
    }
    storage.removeItem(`xreader:${key}`);
  } catch {
    return;
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initialize with safe defaults to avoid SSR hydration mismatch
  density: 'comfortable',
  theme: 'system',
  layout: 'classic',
  fontSize: 17,
  accentColor: 'blue',
  focusMode: false,
  readFilter: 'unread',
  currentView: 'today',
  selectedSourceId: null,
  nativeLanguage: 'zh-CN',
  isShortcutsOpen: false,
  operationSide: 'right',
  operationSideNotice: null,
  sourceImportJob: null,
  _hydrated: false,

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
  openShortcuts: () => set({ isShortcutsOpen: true }),
  closeShortcuts: () => set({ isShortcutsOpen: false }),
  setOperationSide: (operationSide) => {
    if (get().operationSide === operationSide) return;

    set({ operationSide, operationSideNotice: operationSide });
    persist('operationSide', operationSide);
  },
  clearOperationSideNotice: () => set({ operationSideNotice: null }),
  startSourceImport: (jobId, fileName) => {
    const job = { id: jobId, fileName, startedAt: Date.now() };
    set({ sourceImportJob: job });
    persist('sourceImportJobId', job.id);
    persist('sourceImportFileName', job.fileName);
    persist('sourceImportStartedAt', job.startedAt);
  },
  clearSourceImport: () => {
    set({ sourceImportJob: null });
    removeStoredValue('sourceImportJobId');
    removeStoredValue('sourceImportFileName');
    removeStoredValue('sourceImportStartedAt');
  },

  hydrate: (prefs) => {
    const update: Partial<UIState> = {};
    if (prefs.density_pref && isValidDensity(prefs.density_pref)) update.density = prefs.density_pref;
    if (prefs.theme_pref && isValidTheme(prefs.theme_pref)) update.theme = prefs.theme_pref;
    if (prefs.native_language) update.nativeLanguage = prefs.native_language;
    set(update);
  },

  hydrateFromLocalStorage: () => {
    if (get()._hydrated) return;

    const storedDensity = readStoredValue('density');
    const storedTheme = readStoredValue('theme');
    const storedLayout = readStoredValue('layout');
    const storedFontSize = readStoredValue('fontSize');
    const storedAccentColor = readStoredValue('accentColor');
    const storedFocusMode = readStoredValue('focusMode');
    const storedReadFilter = readStoredValue('readFilter');
    const storedCurrentView = readStoredValue('currentView');
    const storedSelectedSourceId = readStoredValue('selectedSourceId');
    const storedNativeLanguage = readStoredValue('nativeLanguage');
    const storedOperationSide = readStoredValue('operationSide');
    const storedImportJobId = readStoredValue('sourceImportJobId');
    const storedImportFileName = readStoredValue('sourceImportFileName');
    const storedImportStartedAt = readStoredValue('sourceImportStartedAt');

    const update: Partial<UIState> = { _hydrated: true };

    if (isValidDensity(storedDensity)) update.density = storedDensity;
    if (isValidTheme(storedTheme)) update.theme = storedTheme;
    if (isValidLayout(storedLayout)) update.layout = storedLayout;
    if (isValidFontSize(storedFontSize)) update.fontSize = Number(storedFontSize);
    if (isValidAccentColor(storedAccentColor)) update.accentColor = storedAccentColor;
    if (storedFocusMode === 'true' || storedFocusMode === 'false') update.focusMode = storedFocusMode === 'true';
    if (isValidReadFilter(storedReadFilter)) update.readFilter = storedReadFilter;
    if (isValidViewTab(storedCurrentView)) update.currentView = storedCurrentView;
    if (storedSelectedSourceId && Number.isFinite(Number(storedSelectedSourceId))) {
      update.selectedSourceId = Number(storedSelectedSourceId);
    }
    if (storedNativeLanguage) update.nativeLanguage = storedNativeLanguage;
    if (isValidOperationSide(storedOperationSide)) update.operationSide = storedOperationSide;
    if (storedImportJobId) {
      const startedAt = Number(storedImportStartedAt);
      update.sourceImportJob = {
        id: storedImportJobId,
        fileName: storedImportFileName || 'subscriptions.opml',
        startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      };
    }

    set(update);
  },
}));
