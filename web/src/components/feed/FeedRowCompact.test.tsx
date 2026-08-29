import { render, screen } from '@testing-library/react';
import { FeedRowCompact } from './FeedRowCompact';
import type { ArticleItem } from '@/lib/types';
import { useUIStore } from '@/stores/useUIStore';

const mockItem: ArticleItem = {
  id: 1,
  source_id: 1,
  title: 'Test Title',
  link: '#',
  language: 'en',
  title_translated: '测试标题',
  source_title: 'Vercel',
  published_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
};

beforeEach(() => {
  useUIStore.setState({ nativeLanguage: 'zh-CN', operationSide: 'right' });
});

test('renders compact row with source label and translated title', () => {
  render(<FeedRowCompact item={mockItem} />);

  expect(screen.getByText('测试标题')).toBeInTheDocument();
  expect(screen.getByText('VERCEL')).toBeInTheDocument();
  expect(screen.getByText('3h')).toBeInTheDocument();
});

test('does not render reading-time footer in compact mode', () => {
  render(<FeedRowCompact item={mockItem} />);
  expect(screen.queryByText(/分钟阅读/i)).not.toBeInTheDocument();
});

test('renders a mobile-sized mark-read action target', () => {
  render(<FeedRowCompact item={mockItem} onMarkRead={vi.fn()} />);

  expect(screen.getByRole('button', { name: '标已读' })).toHaveClass('min-h-11', 'min-w-11');
});

test('places the mark-read action on the right by default and restores the current left edge on desktop', () => {
  render(<FeedRowCompact item={mockItem} onMarkRead={vi.fn()} />);

  expect(screen.getByTestId('feed-row-actions')).toHaveClass('justify-end', 'md:justify-start');
});

test('places the mark-read action on the left for left-side operation', () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<FeedRowCompact item={mockItem} onMarkRead={vi.fn()} />);

  const actions = screen.getByTestId('feed-row-actions');
  expect(actions).toHaveClass('justify-start');
  expect(actions).not.toHaveClass('justify-end');
});

test('keeps the pending undo action in the operation-side group with a mobile-sized target', () => {
  render(<FeedRowCompact item={mockItem} pendingRead onUndoRead={vi.fn()} />);

  const undo = screen.getByRole('button', { name: '撤销已读' });
  expect(screen.getByTestId('feed-row-actions')).toContainElement(undo);
  expect(undo).toHaveClass('min-h-11', 'min-w-11');
});

test('keeps the selected indicator on the physical left for left-side operation', () => {
  useUIStore.setState({ operationSide: 'left' });
  const { container } = render(<FeedRowCompact item={mockItem} selected />);

  const indicator = container.querySelector('.absolute.left-0');
  expect(indicator).toBeInTheDocument();
  expect(indicator).not.toHaveClass('right-0', 'operation-edge-anchor');
});
