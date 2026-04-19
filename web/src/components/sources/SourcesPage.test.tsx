import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

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

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('SourcesPage renders title and add button', () => {
  render(<SourcesPage />, { wrapper });

  expect(screen.getByText('订阅源管理')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '订阅源' })).toBeInTheDocument();
});
