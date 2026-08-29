import { fireEvent, render, screen, within } from '@testing-library/react';
import { ReaderHeader } from './ReaderHeader';
import type { ArticleItem } from '@/lib/types';
import { useUIStore } from '@/stores/useUIStore';

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

beforeEach(() => {
  useUIStore.setState({
    nativeLanguage: 'zh-CN',
    operationSide: 'right',
    operationSideNotice: null,
  });
});

function renderHeader() {
  const result = render(
    <ReaderHeader
      article={article}
      onBack={vi.fn()}
      onToggleStar={vi.fn()}
      onShare={vi.fn()}
      onToggleFocus={vi.fn()}
      onOpenTweaks={vi.fn()}
    />,
  );

  const back = screen.getByRole('button', { name: '返回列表' });
  const star = screen.getByRole('button', { name: '收藏' });
  const more = screen.getByRole('button', { name: '更多操作' });
  const metadata = screen.getByText("Let's Encrypt").closest('.min-w-0');

  if (!metadata) throw new Error('reader metadata container not found');

  return { ...result, back, star, more, metadata };
}

test('keeps original-article action out of the sticky reader chrome', () => {
  render(<ReaderHeader article={article} />);

  expect(screen.queryByRole('button', { name: '阅读原文' })).not.toBeInTheDocument();
});

test('keeps the existing compact order and right-opening menu for right-side operation', () => {
  const { back, star, more, metadata } = renderHeader();

  expect(back).not.toHaveClass('order-1');
  expect(star).not.toHaveClass('order-2');
  expect(more.parentElement).not.toHaveClass('order-3');
  expect(metadata).not.toHaveClass('order-4');
  expect(screen.getByText('返回')).toHaveClass('md:hidden');

  fireEvent.click(more);
  const popup = screen.getByText('分享').closest('button')?.parentElement;
  expect(popup).toHaveClass('right-0', 'left-auto');
});

test('orders compact left-side controls without changing action focus order or arrow meaning', () => {
  useUIStore.setState({ operationSide: 'left' });
  const { back, star, more, metadata } = renderHeader();

  expect(back).toHaveClass('order-1', 'md:order-none');
  expect(back).toHaveClass('h-10', 'w-10');
  expect(back).not.toHaveClass('w-auto');
  expect(star).toHaveClass('order-2', 'md:order-none');
  expect(more.parentElement).toHaveClass('order-3', 'md:order-none');
  expect(metadata).toHaveClass('order-4', 'md:order-none');
  expect(screen.queryByText('返回')).not.toBeInTheDocument();
  expect(back).toHaveAttribute('aria-label', '返回列表');
  expect(back.querySelector('svg')).toHaveClass('lucide-arrow-left');

  expect(back.compareDocumentPosition(star) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(star.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.click(more);
  const popup = screen.getByText('分享').closest('button')?.parentElement;
  if (!popup) throw new Error('mobile overflow popup not found');
  expect(popup).toHaveClass('left-0', 'right-auto');
  expect(within(popup).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '分享',
    '专注模式',
    '打开阅读设置',
  ]);
});
