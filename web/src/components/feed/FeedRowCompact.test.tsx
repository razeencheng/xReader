import { render, screen } from '@testing-library/react';
import { FeedRowCompact } from './FeedRowCompact';
import type { Article } from '@/lib/types';

const mockItem: Article = {
  id: 1,
  source_id: 1,
  title: 'Test Title',
  title_translated: 'Translated Title',
  link: 'https://example.com',
  language: 'en',
  published_at: new Date().toISOString(),
  source_title: 'Vercel',
  summary: 'Some summary text',
};

test('renders title and badge', () => {
  render(<FeedRowCompact item={mockItem} />);
  expect(screen.getByText('Translated Title')).toBeInTheDocument();
  expect(screen.getByText('Vercel')).toBeInTheDocument();
});

test('shows summary as tooltip', () => {
  const { container } = render(<FeedRowCompact item={mockItem} />);
  expect(container.firstChild).toHaveAttribute('title', 'Some summary text');
});

test('renders metadata pushed right via ml-auto', () => {
  const { container } = render(<FeedRowCompact item={mockItem} />);
  const children = Array.from(container.firstChild!.childNodes) as HTMLElement[];
  const last = children[children.length - 1];
  expect(last.className).toContain('ml-auto');
});
