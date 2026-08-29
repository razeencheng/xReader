import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useUIStore } from '@/stores/useUIStore';
import { OperationSideNotice } from './OperationSideNotice';

beforeEach(() => {
  vi.useFakeTimers();
  useUIStore.setState({
    nativeLanguage: 'zh-CN',
    operationSide: 'left',
    operationSideNotice: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('renders nothing without a pending operation-side notice', () => {
  const { container } = render(<OperationSideNotice />);
  expect(container).toBeEmptyDOMElement();
});

test('renders localized centered status feedback above the safe area', () => {
  useUIStore.setState({ operationSideNotice: 'left' });
  render(<OperationSideNotice />);

  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-live', 'polite');
  expect(status).toHaveTextContent('单手操作已切换到左侧');
  expect(status).toHaveClass('left-1/2', '-translate-x-1/2');
  expect(status).toHaveClass(
    'fixed',
    'bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))]',
    'pointer-events-none',
    'z-[150]',
    'motion-reduce:transition-none',
  );
  expect(status).not.toHaveClass('operation-edge-anchor');
});

test('clears the notice after about 1800ms', () => {
  useUIStore.setState({ operationSideNotice: 'right' });
  render(<OperationSideNotice />);

  act(() => vi.advanceTimersByTime(1799));
  expect(screen.getByRole('status')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(useUIStore.getState().operationSideNotice).toBeNull();
});

test('resets the timer when the notice changes and cleans it up on unmount', () => {
  const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
  useUIStore.setState({ operationSideNotice: 'left' });
  const rendered = render(<OperationSideNotice />);

  act(() => vi.advanceTimersByTime(1200));
  act(() => useUIStore.setState({ operationSideNotice: 'right' }));
  act(() => vi.advanceTimersByTime(700));
  expect(screen.getByRole('status')).toHaveTextContent('单手操作已切换到右侧');

  rendered.unmount();
  expect(clearTimeoutSpy).toHaveBeenCalled();
  act(() => vi.runOnlyPendingTimers());
  expect(useUIStore.getState().operationSideNotice).toBe('right');
  clearTimeoutSpy.mockRestore();
});

test('is mounted once beside the other stable app-level overlays', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/(app)/layout.tsx'), 'utf8');
  expect(layout.match(/<OperationSideNotice\s*\/>/g)).toHaveLength(1);
  expect(layout).toMatch(/<KeyboardShortcutsModal[^>]*\/>\s*<SourceImportStatus\s*\/>\s*<OperationSideNotice\s*\/>/s);
});
