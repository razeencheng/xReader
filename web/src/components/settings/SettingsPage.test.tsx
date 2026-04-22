import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const invalidateQueries = vi.fn();
const fetchMe = vi.fn();
const toggleDensity = vi.fn();
const setTheme = vi.fn();
const apiFetch = vi.fn();

let authState = {
  user: {
    id: 1,
    github_username: 'razeencheng',
    role: 'admin',
    native_language: 'zh-CN',
    density_pref: 'comfortable',
    theme_pref: 'system',
  },
  fetchMe,
};

let uiState = {
  density: 'comfortable' as const,
  theme: 'system' as const,
  nativeLanguage: 'zh-CN',
  toggleDensity,
  setTheme,
  hydrate: vi.fn(),
};

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof authState) => unknown) => selector(authState),
    {
      getState: () => authState,
    },
  ),
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
    }),
  };
});

import SettingsPage from '@/app/(app)/settings/page';

afterEach(() => {
  vi.clearAllMocks();
  authState = {
    ...authState,
    fetchMe,
  };
  uiState = {
    ...uiState,
    toggleDensity,
    setTheme,
  };
});

beforeEach(() => {
  apiFetch.mockImplementation(async (input: unknown, init?: RequestInit) => {
    if (input === '/api/users/me' && (!init || !init.method || init.method === 'GET')) {
      return {
        native_language: 'zh-CN',
        density_pref: 'comfortable',
        theme_pref: 'system',
      };
    }

    return {};
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

test('renders settings title and language options', async () => {
  renderPage();

  expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
  const select = screen.getByLabelText('母语');
  expect(select).toHaveDisplayValue('zh-CN');
  expect(screen.getByRole('option', { name: 'zh-CN' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'zh-TW' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'en-US' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'ja-JP' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'ko-KR' })).toBeInTheDocument();
});
