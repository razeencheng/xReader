import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TweaksPanel } from './TweaksPanel';
import { useUIStore } from '@/stores/useUIStore';

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
    layout: 'classic',
    focusMode: false,
    density: 'comfortable',
    fontSize: 17,
    accentColor: 'blue',
    theme: 'system',
    nativeLanguage: 'zh-CN',
    operationSide: 'right',
    operationSideNotice: null,
  });
});

test('switches to focus layout from tweaks panel', async () => {
  const user = userEvent.setup();
  render(<TweaksPanel externalOpen />);

  expect(screen.getByText('阅读设置')).toBeInTheDocument();
  expect(screen.getByText('版式')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '专注' }));

  expect(useUIStore.getState().layout).toBe('focus');
  expect(useUIStore.getState().focusMode).toBe(true);
});

test('switches back to wide layout and exits focus mode', async () => {
  const user = userEvent.setup();
  useUIStore.setState({ layout: 'focus', focusMode: true });

  render(<TweaksPanel externalOpen />);

  await user.click(screen.getByRole('button', { name: '宽屏' }));

  expect(useUIStore.getState().layout).toBe('wide');
  expect(useUIStore.getState().focusMode).toBe(false);
});

test('changes theme from tweaks panel', async () => {
  const user = userEvent.setup();
  render(<TweaksPanel externalOpen />);

  expect(screen.getByText('主题')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '深色' }));

  expect(useUIStore.getState().theme).toBe('dark');
});

test('anchors the panel to the operation edge without horizontal motion', () => {
  render(<TweaksPanel externalOpen />);

  const wrapper = screen.getByText('阅读设置').closest('.operation-edge-anchor');
  expect(wrapper).toHaveClass('absolute', 'bottom-5', 'operation-edge-anchor', 'z-[100]');
  expect(wrapper).not.toHaveClass('right-5');
  expect(wrapper).toHaveStyle({ '--operation-edge-offset': '1.25rem' });

  const panel = screen.getByText('阅读设置').parentElement;
  expect(panel?.getAttribute('style')).not.toContain('translateX');
});

test('shows the one-handed selector only in compact layouts at the panel end', () => {
  render(<TweaksPanel externalOpen />);

  const selector = screen.getByRole('group', { name: '单手操作' }).closest('section');
  expect(selector).toHaveClass('md:hidden', 'mt-4', 'border-t', 'border-[var(--border-light)]', 'pt-4');
  expect(selector).toBe(screen.getByText('阅读设置').parentElement?.lastElementChild);
});

test('selecting a new operation side closes once and keeps the global notice', async () => {
  const onExternalClose = vi.fn();
  const user = userEvent.setup();
  render(<TweaksPanel externalOpen onExternalClose={onExternalClose} />);

  await user.click(screen.getByRole('button', { name: '左侧' }));

  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(localStorage.getItem('xreader:operationSide')).toBe('left');
  expect(onExternalClose).toHaveBeenCalledTimes(1);
});

test('selecting the current operation side does not close or persist', async () => {
  const onExternalClose = vi.fn();
  const user = userEvent.setup();
  render(<TweaksPanel externalOpen onExternalClose={onExternalClose} />);

  await user.click(screen.getByRole('button', { name: '右侧' }));

  expect(useUIStore.getState().operationSide).toBe('right');
  expect(useUIStore.getState().operationSideNotice).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  expect(onExternalClose).not.toHaveBeenCalled();
});
