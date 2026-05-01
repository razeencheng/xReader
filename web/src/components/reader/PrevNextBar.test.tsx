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

const current: ArticleItem = { id: 2, source_id: 1, title: 'Current', source_title: 'Current Source', link: '', language: 'en' };
const prev: ArticleItem = { id: 1, source_id: 1, title: 'Previous Article', source_title: 'Previous Source', link: '', language: 'en' };
const next: ArticleItem = { id: 3, source_id: 1, title: 'Next Article', source_title: 'Next Source', link: '', language: 'en' };

beforeEach(() => {
  push.mockReset();
  useSearchParams.mockReturnValue(new URLSearchParams('ctx=today'));
});

test('clicking 下一篇 calls markRead with current article id', async () => {
  const markRead = vi.fn();
  render(<PrevNextBar current={current} prev={prev} next={next} markRead={markRead} />);

  await userEvent.click(screen.getByRole('button', { name: /下一篇/i }));

  expect(markRead).toHaveBeenCalledWith(2);
  expect(push).toHaveBeenCalledWith('/?ctx=today&article=3');
});

test('renders source labels for previous and next articles', () => {
  render(<PrevNextBar current={current} prev={prev} next={next} markRead={vi.fn()} />);

  expect(screen.getByText('Previous Source')).toBeInTheDocument();
  expect(screen.getByText('Next Source')).toBeInTheDocument();
});

test('hides prev button when prev is null', () => {
  render(<PrevNextBar current={current} prev={null} next={next} markRead={vi.fn()} />);

  expect(screen.queryByRole('button', { name: /上一篇/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /下一篇/i })).toBeInTheDocument();
});

test('keeps the navigation bar visible on mobile with safe-area padding', () => {
  const { container } = render(<PrevNextBar current={current} prev={prev} next={next} markRead={vi.fn()} />);

  expect(container.firstElementChild).not.toHaveClass('hidden');
  expect(container.firstElementChild).toHaveClass('pb-[max(16px,calc(env(safe-area-inset-bottom)+12px))]');
  expect(container.querySelector('.hide-mobile')).toBeNull();
});
