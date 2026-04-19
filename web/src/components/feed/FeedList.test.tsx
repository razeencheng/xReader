import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tab=today'),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import { FeedList } from './FeedList';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('FeedList shows empty state when no data', async () => {
  (apiFetch as any).mockResolvedValue({ items: [], next_cursor: null });
  render(<FeedList />, { wrapper });
  expect(await screen.findByText(/还没有订阅/)).toBeInTheDocument();
});

test('FeedList renders items', async () => {
  (apiFetch as any).mockResolvedValue({
    items: [{ id: 1, source_id: 1, title: 'Test Article', link: 'https://example.com', language: 'en' }],
    next_cursor: null,
  });
  render(<FeedList />, { wrapper });
  expect(await screen.findByText('Test Article')).toBeInTheDocument();
});
