import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TweaksPanel } from './TweaksPanel';
import { useUIStore } from '@/stores/useUIStore';

beforeEach(() => {
  useUIStore.setState({
    layout: 'classic',
    focusMode: false,
    density: 'comfortable',
    fontSize: 17,
    accentColor: 'blue',
  });
});

test('switches to focus layout from tweaks panel', async () => {
  const user = userEvent.setup();
  render(<TweaksPanel />);

  await user.click(screen.getByRole('button', { name: /Open tweaks/i }));
  await user.click(screen.getByRole('button', { name: 'Focus' }));

  expect(useUIStore.getState().layout).toBe('focus');
  expect(useUIStore.getState().focusMode).toBe(true);
});

test('switches back to wide layout and exits focus mode', async () => {
  const user = userEvent.setup();
  useUIStore.setState({ layout: 'focus', focusMode: true });

  render(<TweaksPanel />);

  await user.click(screen.getByRole('button', { name: /Open tweaks/i }));
  await user.click(screen.getByRole('button', { name: 'Wide' }));

  expect(useUIStore.getState().layout).toBe('wide');
  expect(useUIStore.getState().focusMode).toBe(false);
});
