import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/useTouchCapability', () => ({ useTouchCapability: () => true }));

import { ReaderAdvanceButton } from './ReaderAdvanceButton';

test('renders a touch-sized mark-read-and-next control', async () => {
  const onAdvance = vi.fn();
  render(<ReaderAdvanceButton mode="next" phase="idle" hidden={false} onAdvance={onAdvance} />);
  const button = screen.getByRole('button', { name: /标为已读.*下一篇/ });
  expect(button).toHaveClass('min-h-12', 'min-w-12');
  await userEvent.click(button);
  expect(onAdvance).toHaveBeenCalledTimes(1);
});

test('changes the final item action to complete current article', () => {
  render(<ReaderAdvanceButton mode="complete-current" phase="idle" hidden={false} onAdvance={vi.fn()} />);
  expect(screen.getByRole('button', { name: /标为已读/ })).toHaveTextContent('完成本篇');
});

test('is non-interactive while hidden or when no action remains', () => {
  const { rerender } = render(<ReaderAdvanceButton mode="next" phase="idle" hidden onAdvance={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(<ReaderAdvanceButton mode="none" phase="idle" hidden={false} onAdvance={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('announces loading and disables repeated taps', () => {
  render(<ReaderAdvanceButton mode="load-next" phase="loading" hidden={false} onAdvance={vi.fn()} />);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent(/加载/);
});
