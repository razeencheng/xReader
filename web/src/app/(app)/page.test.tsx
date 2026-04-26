import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeedPage from './page';
import { useUIStore } from '@/stores/useUIStore';
import type { ArticleItem } from '@/lib/types';

const push = vi.fn();
const replace = vi.fn();
const searchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('@/components/feed/FeedList', () => ({
  FeedList: ({ onOpenArticle, selectedArticleId }: { onOpenArticle?: (article: ArticleItem) => void; selectedArticleId?: number | null }) => (
    <div data-testid="feed-list" data-selected-id={selectedArticleId ?? ''}>
      <button
        type="button"
        onClick={() =>
          onOpenArticle?.({
            id: 7,
            source_id: 1,
            title: 'Article 7',
            link: 'https://example.com/7',
            language: 'en',
            is_read: false,
          })
        }
      >
        Open Article 7
      </button>
    </div>
  ),
}));

vi.mock('@/components/layout/SourceBrowser', () => ({
  SourceBrowser: () => <div data-testid="source-browser" />,
}));

vi.mock('@/components/reader/ArticleView', () => ({
  ArticleView: ({ id }: { id: string }) => <div data-testid="article-view">Article {id}</div>,
}));

vi.mock('@/hooks/useArticleNavigation', () => ({
  useArticleNavigation: vi.fn(),
}));

vi.mock('@/lib/queries/articles', () => ({
  useArticles: () => ({
    data: {
      pages: [
        {
          items: [
            { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
            { id: 7, source_id: 1, title: 'Article 7', link: 'https://example.com/7', language: 'en', is_read: false },
          ],
          next_cursor: null,
        },
      ],
      pageParams: [undefined],
    },
  }),
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  searchParamsMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
  useUIStore.setState({
    currentView: 'today',
    selectedSourceId: null,
    readFilter: 'unread',
    focusMode: false,
  });
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('stretches the feed transition pane across single-column layouts', async () => {
  render(<FeedPage />, { wrapper });

  const transitionPane = (await screen.findByTestId('feed-list')).parentElement;

  expect(transitionPane).toHaveClass('w-full');
});

test('stretches the source browser transition pane across single-column layouts', async () => {
  useUIStore.setState({ currentView: 'sources', selectedSourceId: null });

  render(<FeedPage />, { wrapper });

  const transitionPane = (await screen.findByTestId('source-browser')).parentElement;

  expect(transitionPane).toHaveClass('w-full');
});

test('restores the selected article from the URL after a hard refresh', async () => {
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today'));

  render(<FeedPage />, { wrapper });

  expect(await screen.findByTestId('article-view')).toHaveTextContent('Article 2');
  expect(screen.getByTestId('feed-list')).toHaveAttribute('data-selected-id', '2');
});

test('writes the opened article into the URL so refresh keeps reading context', async () => {
  const user = userEvent.setup();

  render(<FeedPage />, { wrapper });
  await user.click(screen.getByRole('button', { name: 'Open Article 7' }));

  expect(push).toHaveBeenCalledWith('/?article=7&ctx=today');
});
