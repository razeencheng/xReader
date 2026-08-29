import { fireEvent, render, screen } from '@testing-library/react';
import { useUIStore } from '@/stores/useUIStore';
import { OperationSideControl } from './OperationSideControl';

const storage = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => storage.set(key, value));

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});

beforeEach(() => {
  storage.clear();
  setItem.mockClear();
  useUIStore.setState({
    nativeLanguage: 'zh-CN',
    operationSide: 'right',
    operationSideNotice: null,
  });
});

test('renders as a compact-only localized group with accessible touch targets', () => {
  const { container } = render(<OperationSideControl className="custom-control" />);

  const section = container.firstElementChild;
  expect(section).toHaveClass('md:hidden', 'custom-control');
  expect(screen.getByText('单手操作')).toBeInTheDocument();
  expect(screen.getByText('将手机上的常用操作放到顺手的一侧。')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '单手操作' })).toBeInTheDocument();

  const left = screen.getByRole('button', { name: '左侧' });
  const right = screen.getByRole('button', { name: '右侧' });
  expect(left).toHaveClass('min-h-11', 'min-w-11', 'ui-pill-neutral');
  expect(right).toHaveClass('min-h-11', 'min-w-11', 'ui-pill-active');
  expect(left).toHaveAttribute('aria-pressed', 'false');
  expect(right).toHaveAttribute('aria-pressed', 'true');
});

test('selecting a new side persists it, publishes a notice, and calls back once', () => {
  const onSelected = vi.fn();
  render(<OperationSideControl onSelected={onSelected} />);

  fireEvent.click(screen.getByRole('button', { name: '左侧' }));

  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(localStorage.getItem('xreader:operationSide')).toBe('left');
  expect(onSelected).toHaveBeenCalledTimes(1);
});

test('selecting the current side is a complete no-op', () => {
  const onSelected = vi.fn();
  render(<OperationSideControl onSelected={onSelected} />);

  fireEvent.click(screen.getByRole('button', { name: '右侧' }));

  expect(useUIStore.getState().operationSide).toBe('right');
  expect(useUIStore.getState().operationSideNotice).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  expect(onSelected).not.toHaveBeenCalled();
});
