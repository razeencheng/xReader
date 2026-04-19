import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tab=today'),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import { FeedList } from './FeedList';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

test('FeedList shows empty state when no data', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ items: [], next_cursor: null });

  render(<FeedList />, { wrapper });

  expect(await screen.findByText(/还没有订阅任何源/)).toBeInTheDocument();
  expect(screen.getByText(/立刻添加一个/)).toBeInTheDocument();
});

test('FeedList renders items', async () => {
  vi.mocked(apiFetch).mockResolvedValue({
    items: [
      {
        id: 1,
        source_id: 1,
        title: 'Test Article',
        link: 'https://example.com',
        language: 'en',
      },
    ],
    next_cursor: null,
  });

  render(<FeedList />, { wrapper });

  expect(await screen.findByText('Test Article')).toBeInTheDocument();
});
