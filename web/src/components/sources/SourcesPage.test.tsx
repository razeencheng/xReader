import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUIStore } from '@/stores/useUIStore';

vi.mock('@/lib/queries/sources', () => ({
  useSources: () => ({ data: [], isLoading: false, isFetching: false }),
  useCreateSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenameSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefreshSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSourceImportJob: () => ({ data: null, isFetching: false }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { SourcesPage } from '@/app/(app)/sources/page';

beforeEach(() => {
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
