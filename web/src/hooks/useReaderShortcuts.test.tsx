import { act, render, screen } from '@testing-library/react';
import { dispatchKey } from '@/lib/keyboard';
import { useReaderShortcuts } from './useReaderShortcuts';

function Harness(props: Parameters<typeof useReaderShortcuts>[0]) {
  const { isShortcutsOpen } = useReaderShortcuts(props);
  return <div>{isShortcutsOpen ? 'shortcuts-open' : 'shortcuts-closed'}</div>;
}

test('question mark opens shortcuts modal and blocks article actions until escape', () => {
  const onNext = vi.fn();
  const onEscape = vi.fn();

  render(<Harness onNext={onNext} onEscape={onEscape} />);

  expect(screen.getByText('shortcuts-closed')).toBeInTheDocument();
  act(() => {
    expect(dispatchKey('?')).toBe(true);
  });
  expect(screen.getByText('shortcuts-open')).toBeInTheDocument();

  expect(dispatchKey('j')).toBe(false);
  expect(onNext).not.toHaveBeenCalled();

  act(() => {
    expect(dispatchKey('escape')).toBe(true);
  });
  expect(screen.getByText('shortcuts-closed')).toBeInTheDocument();
  expect(onEscape).not.toHaveBeenCalled();
});

test('reader shortcut actions fire when modal is closed', () => {
  const onNext = vi.fn();
  const onPrev = vi.fn();
  const onToggleStar = vi.fn();
  const onMarkRead = vi.fn();
  const onToggleFocus = vi.fn();
  const onEscape = vi.fn();

  render(
    <Harness
      onNext={onNext}
      onPrev={onPrev}
      onToggleStar={onToggleStar}
      onMarkRead={onMarkRead}
      onToggleFocus={onToggleFocus}
      onEscape={onEscape}
    />,
  );

  expect(dispatchKey('j')).toBe(true);
  expect(dispatchKey('k')).toBe(true);
  expect(dispatchKey('arrowright')).toBe(true);
  expect(dispatchKey('arrowleft')).toBe(true);
  expect(dispatchKey('s')).toBe(true);
  expect(dispatchKey('r')).toBe(true);
  expect(dispatchKey('f')).toBe(true);
  expect(dispatchKey('escape')).toBe(true);

  expect(onNext).toHaveBeenCalledTimes(2);
  expect(onPrev).toHaveBeenCalledTimes(2);
  expect(onToggleStar).toHaveBeenCalledTimes(1);
  expect(onMarkRead).toHaveBeenCalledTimes(1);
  expect(onToggleFocus).toHaveBeenCalledTimes(1);
  expect(onEscape).toHaveBeenCalledTimes(1);
});
