import { render, screen } from '@testing-library/react';
import { FeedRowCompact } from './FeedRowCompact';
import type { ArticleItem } from '@/lib/types';

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

test('renders title, badge, and time', () => {
  render(<FeedRowCompact item={mockItem} />);

  expect(screen.getByText('测试标题')).toBeInTheDocument();
  expect(screen.getByText(/Vercel/)).toBeInTheDocument();
  expect(screen.getByText('3h')).toBeInTheDocument();
});

test('uses margin-left auto on time element', () => {
  const { container } = render(<FeedRowCompact item={mockItem} />);
  const row = container.firstChild as HTMLElement;
  const lastChild = row.lastElementChild as HTMLElement;

  expect(lastChild.className).toContain('ml-auto');
});
