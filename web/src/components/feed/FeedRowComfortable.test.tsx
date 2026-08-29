'use client';

import { render, screen } from '@testing-library/react';
import { FeedRowComfortable } from './FeedRowComfortable';
import type { ArticleItem } from '@/lib/types';
import { useUIStore } from '@/stores/useUIStore';

const mockTranslated: ArticleItem = {
  id: 1,
  source_id: 1,
  title: 'Why Vercel AI SDK hit 2M',
  link: '#',
  language: 'en',
  title_translated: 'Vercel AI SDK 为何周下载量突破 200 万',
  source_title: 'Vercel Blog',
  published_at: new Date(Date.now() - 3 * 3600000).toISOString(),
};

const mockNative: ArticleItem = {
  id: 2,
  source_id: 2,
  title: '在北京租房踩的 12 个坑',
  link: '#',
  language: 'zh',
  source_title: 'V2EX',
  published_at: new Date(Date.now() - 5 * 3600000).toISOString(),
};

beforeEach(() => {
  useUIStore.setState({ nativeLanguage: 'zh-CN', operationSide: 'right' });
});

test('renders translated title with original subtitle', () => {
  render(<FeedRowComfortable item={mockTranslated} />);
  expect(screen.getByText(/Vercel AI SDK 为何/)).toBeInTheDocument();
  expect(screen.getByText(/Why Vercel AI SDK/)).toBeInTheDocument();
});

test('does not render original subtitle for native-language article', () => {
  render(<FeedRowComfortable item={mockNative} />);
  expect(screen.queryByText(/Why Vercel/)).not.toBeInTheDocument();
});

test('shows source name and reading time footer', () => {
  render(<FeedRowComfortable item={mockTranslated} />);
  expect(screen.getByText('VERCEL BLOG')).toBeInTheDocument();
  expect(screen.getByText(/分钟阅读/i)).toBeInTheDocument();
});

test('renders mobile-sized action targets for mark-read and star actions', () => {
  render(<FeedRowComfortable item={mockTranslated} onMarkRead={vi.fn()} onStar={vi.fn()} />);

  expect(screen.getByRole('button', { name: '标已读' })).toHaveClass('min-h-11', 'min-w-11');
  expect(screen.getByRole('button', { name: 'Star article' })).toHaveClass('min-h-11', 'min-w-11');
});

test('anchors the compact action group on the right by default without reversing its actions', () => {
  render(<FeedRowComfortable item={mockTranslated} onMarkRead={vi.fn()} onStar={vi.fn()} />);

  const actions = screen.getByTestId('feed-row-actions');
  const markRead = screen.getByRole('button', { name: '标已读' });
  const star = screen.getByRole('button', { name: 'Star article' });

  expect(actions).toHaveClass('ml-auto');
  expect(Array.from(actions.querySelectorAll('button'))).toEqual([markRead, star]);
});

test('moves the compact action group left while restoring the current right edge on desktop', () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<FeedRowComfortable item={mockTranslated} onMarkRead={vi.fn()} onStar={vi.fn()} />);

  const actions = screen.getByTestId('feed-row-actions');
  const markRead = screen.getByRole('button', { name: '标已读' });
  const star = screen.getByRole('button', { name: 'Star article' });

  expect(actions).toHaveClass('order-first', 'mr-auto', 'md:order-last', 'md:ml-auto', 'md:mr-0');
  expect(Array.from(actions.querySelectorAll('button'))).toEqual([markRead, star]);
});

test('keeps the pending undo action in the same group before star', () => {
  render(<FeedRowComfortable item={mockTranslated} pendingRead onUndoRead={vi.fn()} onStar={vi.fn()} />);

  const actions = screen.getByTestId('feed-row-actions');
  const undo = screen.getByRole('button', { name: '撤销已读' });
  const star = screen.getByRole('button', { name: 'Star article' });

  expect(Array.from(actions.querySelectorAll('button'))).toEqual([undo, star]);
});

test('does not create a movable action group when a left-side row has no interactive actions', () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<FeedRowComfortable item={{ ...mockTranslated, is_read: true }} />);

  const readTime = screen.getByText(/\u5206\u949f\u9605\u8bfb/i);
  expect(screen.queryByTestId('feed-row-actions')).not.toBeInTheDocument();
  expect(readTime).not.toHaveClass('order-first', 'mr-auto', 'ml-auto');
});

test('keeps a non-interactive starred indicator outside the movable group on the physical right', () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<FeedRowComfortable item={{ ...mockTranslated, is_read: true, is_starred: true }} />);

  const staticStar = screen.getByTestId('feed-row-static-star');
  expect(screen.queryByTestId('feed-row-actions')).not.toBeInTheDocument();
  expect(staticStar).toHaveClass('order-last', 'ml-auto');
});

test('separates a left interactive mark-read action from the physical-right starred indicator', () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<FeedRowComfortable item={{ ...mockTranslated, is_starred: true }} onMarkRead={vi.fn()} />);

  const actions = screen.getByTestId('feed-row-actions');
  const staticStar = screen.getByTestId('feed-row-static-star');
  expect(actions).toContainElement(screen.getByRole('button', { name: '\u6807\u5df2\u8bfb' }));
  expect(actions).not.toContainElement(staticStar);
  expect(actions).toHaveClass('order-first', 'mr-auto');
  expect(staticStar).toHaveClass('order-last');
  expect(actions.compareDocumentPosition(staticStar) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});

test('keeps the selected indicator on the physical left for left-side operation', () => {
  useUIStore.setState({ operationSide: 'left' });
  const { container } = render(<FeedRowComfortable item={mockTranslated} selected />);

  const indicator = container.querySelector('.absolute.left-0');
  expect(indicator).toBeInTheDocument();
  expect(indicator).not.toHaveClass('right-0', 'operation-edge-anchor');
});
