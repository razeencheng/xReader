import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUIStore } from '@/stores/useUIStore';

const queryState = vi.hoisted(() => ({
  sources: [] as unknown[],
  refreshSource: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
}));

vi.mock('@/lib/queries/sources', () => ({
  useSources: () => ({ data: queryState.sources, isLoading: false, isFetching: false }),
  useCreateSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenameSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefreshSource: () => queryState.refreshSource,
  useSourceImportJob: () => ({ data: null, isFetching: false }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { SourcesPage } from '@/app/(app)/sources/page';

beforeEach(() => {
  queryState.sources = [];
  queryState.refreshSource.mutateAsync.mockReset();
  queryState.refreshSource.mutateAsync.mockResolvedValue(undefined);
  queryState.refreshSource.isPending = false;
  useUIStore.setState({ nativeLanguage: 'zh-CN' });
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('SourcesPage renders title and add button', () => {
  render(<SourcesPage />, { wrapper });

  expect(screen.queryByText('订阅源管理')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '订阅源' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '寻找并添加' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← 返回首页' })).toBeInTheDocument();
});

test('SourcesPage owns its scroll area inside the app shell', () => {
  const { container } = render(<SourcesPage />, { wrapper });
  const shell = container.firstElementChild;

  expect(shell).toHaveClass('h-full');
  expect(shell).toHaveClass('overflow-y-auto');
  expect(shell).not.toHaveClass('min-h-screen');
});

test('SourcesPage follows native language for global labels', () => {
  useUIStore.setState({ nativeLanguage: 'en-US' });

  render(<SourcesPage />, { wrapper });

  expect(screen.queryByText('Manage Sources')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Find and add' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back home' })).toBeInTheDocument();
});

test('SourcesPage shows selected OPML file name after choosing a file', async () => {
  const user = userEvent.setup();
  render(<SourcesPage />, { wrapper });

  const input = screen.getByLabelText('选择文件后上传');
  const file = new File(['<opml></opml>'], 'subscriptions.opml', { type: 'text/x-opml' });
  await user.upload(input, file);

  expect(await screen.findByText('subscriptions.opml')).toBeInTheDocument();
});

test('SourcesPage renders backend health and last fetch metadata', () => {
  queryState.sources = [
    {
      id: 1,
      title: "Let's Encrypt",
      url: 'https://letsencrypt.org/feed.xml',
      category: 'General',
      icon_url: null,
      unread_count: 0,
      last_fetched_at: new Date().toISOString(),
      last_success_at: new Date(Date.now() - 60_000).toISOString(),
      consecutive_fails: 4,
      health: 'warn',
    },
  ];

  render(<SourcesPage />, { wrapper });

  expect(screen.getByText('不稳定')).toBeInTheDocument();
  expect(screen.queryByText('错误')).not.toBeInTheDocument();
  expect(screen.getByText(/上次抓取：刚刚/)).toBeInTheDocument();
});

test('SourcesPage shows refresh errors instead of failing silently', async () => {
  queryState.sources = [
    {
      id: 1,
      title: "Let's Encrypt",
      url: 'https://letsencrypt.org/feed.xml',
      category: 'General',
      icon_url: null,
      unread_count: 0,
      last_fetched_at: null,
      last_success_at: null,
      consecutive_fails: 0,
      health: 'unknown',
    },
  ];
  queryState.refreshSource.mutateAsync.mockRejectedValue(new Error('network down'));
  const user = userEvent.setup();

  render(<SourcesPage />, { wrapper });
  await user.click(screen.getByRole('button', { name: '刷新' }));

  expect(await screen.findByText('network down')).toBeInTheDocument();
});
