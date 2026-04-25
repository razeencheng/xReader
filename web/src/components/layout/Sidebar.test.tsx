import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUIStore } from '@/stores/useUIStore';

const push = vi.fn();
const usePathname = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => usePathname(),
}));

import { Sidebar } from './Sidebar';

beforeEach(() => {
  push.mockReset();
  usePathname.mockReturnValue('/settings');
  useUIStore.setState({
    currentView: 'all',
    nativeLanguage: 'en-US',
    isShortcutsOpen: false,
    focusMode: false,
    selectedSourceId: null,
  });
});

test('clicking sidebar view routes back home from settings page', async () => {
  const user = userEvent.setup();

  render(<Sidebar />);

  await user.click(screen.getByTitle('Today'));

  expect(useUIStore.getState().currentView).toBe('today');
  expect(push).toHaveBeenCalledWith('/');
});
