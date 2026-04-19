import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrevNextBar } from './PrevNextBar';
import type { ArticleItem } from '@/lib/types';

const push = vi.fn();
const useSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => useSearchParams(),
}));

const current: ArticleItem = { id: 2, source_id: 1, title: 'Current', link: '', language: 'en' };
const prev: ArticleItem = { id: 1, source_id: 1, title: 'Previous Article', link: '', language: 'en' };
const next: ArticleItem = { id: 3, source_id: 1, title: 'Next Article', link: '', language: 'en' };

beforeEach(() => {
  push.mockReset();
  useSearchParams.mockReturnValue(new URLSearchParams('ctx=today'));
});

test('clicking 下一篇 calls markRead with current article id', async () => {
  const markRead = vi.fn();
  render(<PrevNextBar current={current} prev={prev} next={next} markRead={markRead} />);

  await userEvent.click(screen.getByRole('button', { name: /下一篇/ }));

  expect(markRead).toHaveBeenCalledWith(2);
  expect(push).toHaveBeenCalledWith('/read/3?ctx=today');
});

test('hides prev button when prev is null', () => {
  render(<PrevNextBar current={current} prev={null} next={next} markRead={vi.fn()} />);

  expect(screen.queryByRole('button', { name: /上一篇/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /下一篇/ })).toBeInTheDocument();
});
