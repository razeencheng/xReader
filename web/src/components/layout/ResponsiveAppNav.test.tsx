import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { MobileTopBar } from './ResponsiveAppNav';

const push = vi.fn();
const usePathname = vi.fn();
const storage = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => storage.set(key, value));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => usePathname(),
}));

beforeEach(() => {
  storage.clear();
  setItem.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
  push.mockReset();
  usePathname.mockReturnValue('/');
  useAuthStore.setState({
    user: {
      id: 1,
      github_username: 'jin',
      role: 'user',
      native_language: 'zh-CN',
      density_pref: 'comfortable',
      theme_pref: 'light',
    },
    isLoading: false,
  });
  useUIStore.setState({
    currentView: 'today',
    nativeLanguage: 'zh-CN',
    focusMode: false,
    selectedSourceId: null,
    operationSide: 'right',
    operationSideNotice: null,
  });
});

test('MobileTopBar keeps brand before menu for right-side operation', () => {
  render(<MobileTopBar focusMode={false} />);

  const row = screen.getByTestId('mobile-topbar-row');
  const brand = screen.getByRole('button', { name: /xReader/i });
  const menu = screen.getByTestId('mobile-menu-trigger');

  expect(Array.from(row.children)).toEqual([brand, menu]);
});

test('MobileTopBar puts menu before brand in real DOM order for left-side operation', () => {
  useUIStore.setState({ operationSide: 'left' });

  render(<MobileTopBar focusMode={false} />);

  const row = screen.getByTestId('mobile-topbar-row');
  const brand = screen.getByRole('button', { name: /xReader/i });
  const menu = screen.getByTestId('mobile-menu-trigger');

  expect(Array.from(row.children)).toEqual([menu, brand]);
  expect(row).not.toHaveClass('flex-row-reverse');
});

test('MobileTopBar exposes one current-view menu on list pages', async () => {
  const user = userEvent.setup();

  render(<MobileTopBar focusMode={false} />);

  expect(screen.queryByRole('navigation', { name: '移动端主导航' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '今日' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '全部' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '今日' }));

  expect(screen.getByText('视图')).toBeInTheDocument();
  expect(screen.getByText('工具')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '收藏' }));

  expect(useUIStore.getState().currentView).toBe('starred');
});

test('MobileTopBar links to the highlights and notes page from tools', async () => {
  const user = userEvent.setup();

  render(<MobileTopBar focusMode={false} />);

  await user.click(screen.getByRole('button', { name: '今日' }));
  await user.click(screen.getByRole('button', { name: '我的高亮' }));

  expect(push).toHaveBeenCalledWith('/highlights');
});

test('MobileTopBar includes the compact operation-side selector in a full-width bottom sheet', async () => {
  const user = userEvent.setup();

  render(<MobileTopBar focusMode={false} />);

  await user.click(screen.getByTestId('mobile-menu-trigger'));

  expect(screen.getByRole('group', { name: '单手操作' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '左侧' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '右侧' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog', { name: '移动端菜单' })).toHaveClass('inset-x-0');
});

test('MobileTopBar keeps the bottom sheet full-width for left-side operation', async () => {
  const user = userEvent.setup();
  useUIStore.setState({ operationSide: 'left' });

  render(<MobileTopBar focusMode={false} />);

  await user.click(screen.getByTestId('mobile-menu-trigger'));

  expect(screen.getByRole('dialog', { name: '移动端菜单' })).toHaveClass('inset-x-0');
});

test('selecting a new operation side persists it, publishes notice, and closes the menu', async () => {
  const user = userEvent.setup();

  render(<MobileTopBar focusMode={false} />);

  await user.click(screen.getByTestId('mobile-menu-trigger'));
  await user.click(screen.getByRole('button', { name: '左侧' }));

  expect(useUIStore.getState().operationSide).toBe('left');
  expect(localStorage.getItem('xreader:operationSide')).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(screen.queryByRole('dialog', { name: '移动端菜单' })).not.toBeInTheDocument();

  const row = screen.getByTestId('mobile-topbar-row');
  expect(Array.from(row.children)).toEqual([
    screen.getByTestId('mobile-menu-trigger'),
    screen.getByRole('button', { name: /xReader/i }),
  ]);
});

test('selecting the current operation side is a no-op and keeps the menu open', async () => {
  const user = userEvent.setup();

  render(<MobileTopBar focusMode={false} />);

  await user.click(screen.getByTestId('mobile-menu-trigger'));
  await user.click(screen.getByRole('button', { name: '右侧' }));

  expect(useUIStore.getState().operationSide).toBe('right');
  expect(useUIStore.getState().operationSideNotice).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: '移动端菜单' })).toBeInTheDocument();
});

test('MobileTopBar shows normal navigation on non-list pages (e.g. /settings)', () => {
  usePathname.mockReturnValue('/settings');

  render(<MobileTopBar focusMode={false} />);

  expect(screen.queryByRole('navigation', { name: '移动端主导航' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /xReader/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument();
});
