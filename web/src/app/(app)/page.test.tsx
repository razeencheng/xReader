import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeedPage from './page';
import { useUIStore } from '@/stores/useUIStore';
import type { ArticleItem } from '@/lib/types';
import { ReadStateProvider } from '@/components/providers/ReadStateProvider';

const push = vi.fn();
const replace = vi.fn();
const searchParamsMock = vi.fn(() => new URLSearchParams());
const articleItemsMock = vi.hoisted(() => ({
  items: [] as ArticleItem[],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
}));
const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
}));

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
  ArticleView: ({ id, onNotFound, onAdvance, advanceMode }: { id: string; onNotFound?: () => void; onAdvance?: () => void; advanceMode?: string }) => (
    <div data-testid="article-view">
      Article {id}
      <button type="button" onClick={onNotFound}>Report missing article</button>
      <button type="button" onClick={onAdvance}>Advance ({advanceMode})</button>
    </div>
  ),
}));

vi.mock('@/hooks/useArticleNavigation', () => ({
  useArticleNavigation: vi.fn(),
}));

vi.mock('@/lib/queries/articles', () => ({
  useArticles: () => ({
    data: {
      pages: [
        {
          items: articleItemsMock.items,
          next_cursor: null,
        },
      ],
      pageParams: [undefined],
    },
    hasNextPage: articleItemsMock.hasNextPage,
    fetchNextPage: articleItemsMock.fetchNextPage,
  }),
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  searchParamsMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
  articleItemsMock.items = [
    { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
    { id: 7, source_id: 1, title: 'Article 7', link: 'https://example.com/7', language: 'en', is_read: false },
  ];
  articleItemsMock.hasNextPage = false;
  articleItemsMock.fetchNextPage.mockReset();
  apiFetchMock.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    const articleId = Number(url.match(/articles\/(\d+)/)?.[1] ?? 0);
    if (!url.endsWith('/state')) {
      return {
        id: articleId,
        source_id: 1,
        title: `Article ${articleId}`,
        link: `https://example.com/${articleId}`,
        language: 'en',
        is_read: false,
      };
    }
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    return {
      article_id: articleId,
      is_read: Boolean(body.is_read),
      is_starred: false,
      state_version: { changed_at_micros: '100', article_id: articleId },
    };
  });
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

  return <QueryClientProvider client={qc}><ReadStateProvider>{children}</ReadStateProvider></QueryClientProvider>;
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

test('unmounts the article list immediately when switching to source browser', async () => {
  useUIStore.setState({ currentView: 'starred', selectedSourceId: null });

  render(<FeedPage />, { wrapper });
  expect(await screen.findByTestId('feed-list')).toBeInTheDocument();

  act(() => {
    useUIStore.getState().setCurrentView('sources', null);
  });

  await screen.findByTestId('source-browser');
  await waitFor(() => {
    expect(screen.queryByTestId('feed-list')).not.toBeInTheDocument();
  });
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

  expect(push).toHaveBeenCalledWith('/?article=7&ctx=today&read=unread');
});

test('replaces a missing selected article with the first visible article', async () => {
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('article=149&ctx=today'));

  render(<FeedPage />, { wrapper });

  expect(await screen.findByTestId('article-view')).toHaveTextContent('Article 149');
  await user.click(screen.getByRole('button', { name: 'Report missing article' }));

  expect(replace).toHaveBeenCalledWith('/?article=2&ctx=today&read=unread', { scroll: false });
});

test('skips a missing selected article that is still present in the cached list', async () => {
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('article=149&ctx=today'));
  articleItemsMock.items = [
    { id: 149, source_id: 1, title: 'Missing Article', link: 'https://example.com/149', language: 'en', is_read: false },
    { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
  ];

  render(<FeedPage />, { wrapper });

  expect(await screen.findByTestId('article-view')).toHaveTextContent('Article 149');
  await user.click(screen.getByRole('button', { name: 'Report missing article' }));

  expect(replace).toHaveBeenCalledWith('/?article=2&ctx=today&read=unread', { scroll: false });
});

test('advance is one compound action: marks the current article read and opens the next article', async () => {
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));

  render(<FeedPage />, { wrapper });
  await user.click(await screen.findByRole('button', { name: 'Advance (next)' }));

  await waitFor(() => {
    expect(apiFetchMock).toHaveBeenCalledWith('/api/articles/2/state', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    }));
  });
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith('/?article=7&ctx=today&read=unread', { scroll: false });
});

test('rapid repeated advance clicks cannot skip more than one article', async () => {
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));

  render(<FeedPage />, { wrapper });
  const advance = await screen.findByRole('button', { name: 'Advance (next)' });
  await user.dblClick(advance);

  expect(push).toHaveBeenCalledTimes(1);
});

test('the last unread article can complete the queue without navigating', async () => {
  const user = userEvent.setup();
  articleItemsMock.items = [
    { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
  ];
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));

  render(<FeedPage />, { wrapper });
  await user.click(await screen.findByRole('button', { name: 'Advance (complete-current)' }));

  await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('当前队列已处理完');
});

test('does not announce queue completion when authoritative reconciliation remains unread', async () => {
  const user = userEvent.setup();
  articleItemsMock.items = [
    { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
  ];
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));
  apiFetchMock
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce({
      article_id: 2,
      is_read: false,
      is_starred: false,
      state_version: { changed_at_micros: '100', article_id: 2 },
    });

  render(<FeedPage />, { wrapper });
  await user.click(await screen.findByRole('button', { name: 'Advance (complete-current)' }));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('上一篇仍为未读'));
  expect(screen.getByRole('status')).not.toHaveTextContent('当前队列已处理完');
});

test('loads the next page before marking read and advancing across a page boundary', async () => {
  const user = userEvent.setup();
  articleItemsMock.items = [
    { id: 2, source_id: 1, title: 'Article 2', link: 'https://example.com/2', language: 'en', is_read: false },
  ];
  articleItemsMock.hasNextPage = true;
  articleItemsMock.fetchNextPage.mockResolvedValue({
    data: {
      pages: [
        { items: articleItemsMock.items, next_cursor: 'cursor-1' },
        { items: [{ id: 7, source_id: 1, title: 'Article 7', link: 'https://example.com/7', language: 'en', is_read: false }], next_cursor: null },
      ],
    },
  });
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));

  render(<FeedPage />, { wrapper });
  await user.click(await screen.findByRole('button', { name: 'Advance (load-next)' }));

  expect(articleItemsMock.fetchNextPage).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
    '/api/articles/2/state',
    expect.objectContaining({ body: JSON.stringify({ is_read: true }) }),
  ));
  expect(push).toHaveBeenCalledWith('/?article=7&ctx=today&read=unread', { scroll: false });
});

test('undo restores unread state and returns to the previous article when the advance target is still active', async () => {
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('article=2&ctx=today&read=unread'));
  const rendered = render(<FeedPage />, { wrapper });

  await user.click(await screen.findByRole('button', { name: 'Advance (next)' }));
  await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
    '/api/articles/2/state',
    expect.objectContaining({ body: JSON.stringify({ is_read: true }) }),
  ));

  searchParamsMock.mockReturnValue(new URLSearchParams('article=7&ctx=today&read=unread'));
  rendered.rerender(<FeedPage />);
  await user.click(await screen.findByRole('button', { name: '撤销' }));

  await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
    '/api/articles/2/state',
    expect.objectContaining({ body: JSON.stringify({ is_read: false }) }),
  ));
  expect(push).toHaveBeenLastCalledWith('/?article=2&ctx=today&read=unread', { scroll: false });
});
