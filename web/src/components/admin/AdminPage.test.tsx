import { render, screen } from '@testing-library/react';

const replace = vi.fn();
const useAuthStore = vi.fn();
const useAllowlist = vi.fn();
const useAddAllowlistEntry = vi.fn();
const useRemoveAllowlistEntry = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (...args: unknown[]) => useAuthStore(...args),
}));

vi.mock('@/lib/queries/admin', () => ({
  useAllowlist: () => useAllowlist(),
  useAddAllowlistEntry: () => useAddAllowlistEntry(),
  useRemoveAllowlistEntry: () => useRemoveAllowlistEntry(),
}));

import AdminPage from '@/app/(app)/admin/page';

beforeEach(() => {
  replace.mockReset();
  useAllowlist.mockReturnValue({ data: [], isLoading: false });
  useAddAllowlistEntry.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
  useRemoveAllowlistEntry.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

test('renders 用户白名单管理 for admin user', () => {
  useAuthStore.mockImplementation((selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: { role: 'admin' } }),
  );

  render(<AdminPage />);

  expect(screen.getByText('用户白名单管理')).toBeInTheDocument();
});

test('redirects non-admin users to home', () => {
  useAuthStore.mockImplementation((selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: { role: 'member' } }),
  );

  const { container } = render(<AdminPage />);

  expect(container).toBeEmptyDOMElement();
  expect(replace).toHaveBeenCalledWith('/');
});
