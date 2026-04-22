import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DensityToggle } from './DensityToggle';
import { useUIStore } from '@/stores/useUIStore';

beforeEach(() => {
  useUIStore.setState({ density: 'comfortable' });
});

test('clicking a density option activates that exact mode', async () => {
  render(<DensityToggle />);

  await userEvent.click(screen.getByRole('button', { name: '紧凑' }));

  expect(useUIStore.getState().density).toBe('compact');
  expect(screen.getByRole('button', { name: '紧凑' })).toHaveAttribute('aria-pressed', 'true');
});

test('clicking the active density does not flip to the other mode', async () => {
  useUIStore.setState({ density: 'compact' });
  render(<DensityToggle />);

  await userEvent.click(screen.getByRole('button', { name: '紧凑' }));

  expect(useUIStore.getState().density).toBe('compact');
  expect(screen.getByRole('button', { name: '紧凑' })).toHaveAttribute('aria-pressed', 'true');
});
