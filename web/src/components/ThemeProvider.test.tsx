import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import { useUIStore } from '@/stores/useUIStore';

beforeAll(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

beforeEach(() => {
  useUIStore.setState({
    theme: 'system',
    accentColor: 'blue',
    fontSize: 17,
    operationSide: 'right',
    operationSideNotice: null,
  });
  document.documentElement.removeAttribute('data-operation-side');
  document.documentElement.setAttribute('dir', 'rtl');
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
});

test('writes the operation side to the root element and follows store updates without changing dir', () => {
  render(<ThemeProvider><span>content</span></ThemeProvider>);

  expect(screen.getByText('content')).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute('data-operation-side', 'right');
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');

  act(() => useUIStore.getState().setOperationSide('left'));

  expect(document.documentElement).toHaveAttribute('data-operation-side', 'left');
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');
});

test('defines a semantic operation edge anchor that only switches left on narrow screens', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

  expect(css).toMatch(/\.operation-edge-anchor\s*\{[^}]*--operation-edge-offset:\s*1rem;[^}]*right:\s*max\(var\(--operation-edge-offset\),\s*env\(safe-area-inset-right\)\);[^}]*left:\s*auto;/s);
  expect(css).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{\s*html\[data-operation-side=["']left["']\]\s+\.operation-edge-anchor\s*\{[^}]*right:\s*auto;[^}]*left:\s*max\(var\(--operation-edge-offset\),\s*env\(safe-area-inset-left\)\);/s);
  expect(css).not.toMatch(/\.operation-edge-anchor\s*\{[^}]*(?:position|bottom):/s);
});
