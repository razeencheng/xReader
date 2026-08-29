import { useUIStore } from './useUIStore';

const storage = new Map<string, string>();
const getItem = vi.fn((key: string) => storage.get(key) ?? null);
const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
const removeItem = vi.fn((key: string) => storage.delete(key));

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem,
    setItem,
    removeItem,
    clear: () => storage.clear(),
  });
});

beforeEach(() => {
  storage.clear();
  getItem.mockClear();
  getItem.mockImplementation((key: string) => storage.get(key) ?? null);
  setItem.mockClear();
  setItem.mockImplementation((key: string, value: string) => storage.set(key, value));
  removeItem.mockClear();
  removeItem.mockImplementation((key: string) => storage.delete(key));
  useUIStore.setState({
    density: 'comfortable',
    theme: 'system',
    nativeLanguage: 'zh-CN',
    operationSide: 'right',
    operationSideNotice: null,
    sourceImportJob: null,
    _hydrated: false,
  });
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
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

test('operation side defaults to right with no notice', () => {
  expect(useUIStore.getInitialState().operationSide).toBe('right');
  expect(useUIStore.getInitialState().operationSideNotice).toBeNull();
});

test('setOperationSide persists locally, publishes a notice, and never syncs to the account', () => {
  useUIStore.getState().setOperationSide('left');

  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(localStorage.getItem('xreader:operationSide')).toBe('left');
  expect(globalThis.fetch).not.toHaveBeenCalled();

  useUIStore.getState().clearOperationSideNotice();
  expect(useUIStore.getState().operationSideNotice).toBeNull();
});

test('setOperationSide is a no-op when the value is unchanged', () => {
  useUIStore.getState().setOperationSide('right');

  expect(useUIStore.getState().operationSideNotice).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('hydrateFromLocalStorage accepts a valid operation side', () => {
  storage.set('xreader:operationSide', 'left');

  useUIStore.getState().hydrateFromLocalStorage();

  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBeNull();
});

test.each(['center', '', 'LEFT'])('hydrateFromLocalStorage ignores invalid operation side %j', (storedValue) => {
  storage.set('xreader:operationSide', storedValue);

  useUIStore.getState().hydrateFromLocalStorage();

  expect(useUIStore.getState().operationSide).toBe('right');
});

test('hydrateFromLocalStorage keeps the right default when storage cannot be read', () => {
  getItem.mockImplementation(() => {
    throw new Error('storage disabled');
  });

  expect(() => useUIStore.getState().hydrateFromLocalStorage()).not.toThrow();
  expect(useUIStore.getState().operationSide).toBe('right');
});

test('storage getter failures keep the right default and still allow a session-side switch', () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('storage disabled', 'SecurityError');
    },
  });

  try {
    expect(() => useUIStore.getState().hydrateFromLocalStorage()).not.toThrow();
    expect(useUIStore.getState().operationSide).toBe('right');

    expect(() => useUIStore.getState().setOperationSide('left')).not.toThrow();
    expect(useUIStore.getState().operationSide).toBe('left');
    expect(useUIStore.getState().operationSideNotice).toBe('left');
  } finally {
    if (storageDescriptor) {
      Object.defineProperty(window, 'localStorage', storageDescriptor);
    }
  }
});

test('account hydration does not overwrite the device operation side', () => {
  useUIStore.setState({ operationSide: 'left' });

  useUIStore.getState().hydrate({ density_pref: 'compact', theme_pref: 'dark', native_language: 'en' });

  expect(useUIStore.getState().operationSide).toBe('left');
});

test('setOperationSide keeps the session value when local storage cannot be written', () => {
  setItem.mockImplementation(() => {
    throw new Error('storage full');
  });

  expect(() => useUIStore.getState().setOperationSide('left')).not.toThrow();
  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('source import job persists across page remounts', () => {
  useUIStore.getState().startSourceImport('import-123', 'feeds.opml');

  expect(useUIStore.getState().sourceImportJob).toMatchObject({
    id: 'import-123',
    fileName: 'feeds.opml',
  });
  expect(localStorage.getItem('xreader:sourceImportJobId')).toBe('import-123');
  expect(localStorage.getItem('xreader:sourceImportFileName')).toBe('feeds.opml');

  useUIStore.setState({ sourceImportJob: null, _hydrated: false });
  useUIStore.getState().hydrateFromLocalStorage();

  expect(useUIStore.getState().sourceImportJob).toMatchObject({
    id: 'import-123',
    fileName: 'feeds.opml',
  });
});

test('clearSourceImport clears active and persisted import job', () => {
  useUIStore.getState().startSourceImport('import-123', 'feeds.opml');

  useUIStore.getState().clearSourceImport();

  expect(useUIStore.getState().sourceImportJob).toBeNull();
  expect(localStorage.getItem('xreader:sourceImportJobId')).toBeNull();
  expect(localStorage.getItem('xreader:sourceImportFileName')).toBeNull();
});
