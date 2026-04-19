import { useUIStore } from './useUIStore';

const storage = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});

beforeEach(() => {
  storage.clear();
  useUIStore.setState({ density: 'comfortable', theme: 'system', nativeLanguage: 'zh-CN' });
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('toggleDensity flips value and persists to localStorage', () => {
  useUIStore.getState().toggleDensity();
  expect(useUIStore.getState().density).toBe('compact');
  expect(localStorage.getItem('xreader:density')).toBe('compact');

  useUIStore.getState().toggleDensity();
  expect(useUIStore.getState().density).toBe('comfortable');
  expect(localStorage.getItem('xreader:density')).toBe('comfortable');
});

test('setTheme persists to localStorage', () => {
  useUIStore.getState().setTheme('dark');
  expect(useUIStore.getState().theme).toBe('dark');
  expect(localStorage.getItem('xreader:theme')).toBe('dark');
});

test('hydrate loads from user prefs', () => {
  useUIStore.getState().hydrate({ density_pref: 'compact', theme_pref: 'dark', native_language: 'en' });
  expect(useUIStore.getState().density).toBe('compact');
  expect(useUIStore.getState().theme).toBe('dark');
  expect(useUIStore.getState().nativeLanguage).toBe('en');
});
