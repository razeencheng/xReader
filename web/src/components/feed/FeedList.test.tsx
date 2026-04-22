import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import { FeedList } from './FeedList';
import { useUIStore } from '@/stores/useUIStore';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  useUIStore.setState({ currentView: 'today', selectedSourceId: null, readFilter: 'unread', density: 'comfortable' });
});

test('FeedList shows all caught up message when unread filter has no items', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ items: [], next_cursor: null });

  render(<FeedList />, { wrapper });

  expect(await screen.findByText(/All caught up/i)).toBeInTheDocument();
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
  expect(screen.getByText('Today')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Unread/i })).toBeInTheDocument();
});

test('FeedList follows externally selected article id', async () => {
  vi.mocked(apiFetch).mockResolvedValue({
    items: [
      {
        id: 1,
        source_id: 1,
        title: 'First Article',
        link: 'https://example.com/1',
        language: 'en',
      },
      {
        id: 2,
        source_id: 1,
        title: 'Second Article',
        link: 'https://example.com/2',
        language: 'en',
      },
    ],
    next_cursor: null,
  });

  render(<FeedList selectedArticleId={2} />, { wrapper });

  const title = await screen.findByText('Second Article');
  expect(title.closest('[role="button"]')).toHaveAttribute('aria-current', 'true');
});
