import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

const queryMocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  refreshAsync: vi.fn(),
}));

vi.mock('@/lib/queries/sources', () => ({
  getSourceImportCompleted: () => 0,
  getSourceImportProgress: () => 0,
  isSourceImportLookupExpired: () => false,
  useSources: () => ({ data: [], isLoading: false }),
  useCreateSource: () => ({ isPending: false, mutateAsync: queryMocks.create }),
  useDeleteSource: () => ({ mutateAsync: queryMocks.remove }),
  useRefreshSource: () => ({ mutate: queryMocks.refresh, mutateAsync: queryMocks.refreshAsync }),
  useSourceImportJob: () => ({ data: null, error: null, isError: false }),
}));

import SourcesPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
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
    nativeLanguage: 'zh-CN',
    operationSide: 'right',
    operationSideNotice: null,
    sourceImportJob: null,
  });
});

test('anchors the Sources tweaks trigger to the semantic operation edge without adding another selector', () => {
  render(<SourcesPage />);

  const trigger = screen.getByRole('button', { name: '微调' });
  expect(trigger).toHaveClass('operation-edge-anchor');
  expect(trigger.style.getPropertyValue('--operation-edge-offset')).toBe('16px');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveAttribute('aria-controls', 'sources-tweaks-panel');
  expect(screen.queryByRole('group', { name: '单手操作' })).not.toBeInTheDocument();
});

test('keeps the tweaks panel connected, edge-anchored, and closeable', async () => {
  const user = userEvent.setup();
  render(<SourcesPage />);

  const trigger = screen.getByRole('button', { name: '微调' });
  await user.click(trigger);

  const panel = document.getElementById('sources-tweaks-panel');
  expect(panel).not.toBeNull();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(panel).toHaveClass('operation-edge-anchor');
  expect(panel?.style.getPropertyValue('--operation-edge-offset')).toBe('16px');
  expect(screen.queryByRole('group', { name: '单手操作' })).not.toBeInTheDocument();

  await user.click(within(panel as HTMLElement).getByRole('button', { name: '关闭' }));

  expect(document.getElementById('sources-tweaks-panel')).toBeNull();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('leaves physical edge selection to the shared anchor while preserving fixed vertical positioning', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/(app)/sources/SourcesPage.module.css'), 'utf8');
  const tweaksButton = css.match(/\.tweaksButton\s*\{([^}]*)\}/s)?.[1];
  const tweaksPanel = css.match(/\.tweaksPanel\s*\{([^}]*)\}/s)?.[1];

  expect(tweaksButton).toBeDefined();
  expect(tweaksPanel).toBeDefined();
  for (const rule of [tweaksButton, tweaksPanel]) {
    expect(rule).toMatch(/position:\s*fixed;/);
    expect(rule).toMatch(/bottom:\s*max\(/);
    expect(rule).not.toMatch(/right:\s*16px;/);
  }
});
