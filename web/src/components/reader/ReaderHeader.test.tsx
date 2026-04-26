import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderHeader } from './ReaderHeader';
import type { ArticleItem } from '@/lib/types';

const article: ArticleItem & { is_starred?: boolean } = {
  id: 1,
  source_id: 1,
  source_title: "Let's Encrypt",
  feed_id: 'entry-1',
  title: 'Original article',
  title_translated: '翻译标题',
  link: 'https://example.com/original',
  language: 'en',
  published_at: new Date().toISOString(),
  reading_time_minutes: 2,
  summary: '',
  is_read: false,
  is_starred: false,
};

test('opens the original article in a new tab from the reader header', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);

  render(<ReaderHeader article={article} />);

  await userEvent.click(screen.getByRole('button', { name: '阅读原文' }));

  expect(open).toHaveBeenCalledWith('https://example.com/original', '_blank', 'noopener,noreferrer');
  open.mockRestore();
});
