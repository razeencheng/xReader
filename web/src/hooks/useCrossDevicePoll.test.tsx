import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ReadStateProvider } from '@/components/providers/ReadStateProvider';
import { useAuthStore, type User } from '@/stores/useAuthStore';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
const applyArticleStateChange = vi.fn();
vi.mock('@/lib/article-state-cache', () => ({
  applyArticleStateChange: (...a: unknown[]) => applyArticleStateChange(...a),
}));

import { apiFetch } from '@/lib/api-client';
import { useCrossDevicePoll } from './useCrossDevicePoll';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}><ReadStateProvider>{children}</ReadStateProvider></QueryClientProvider>;
}

describe('useCrossDevicePoll', () => {
  beforeEach(() => {
    applyArticleStateChange.mockClear();
    vi.mocked(apiFetch).mockResolvedValue({ items: [], next_cursor: 'sc1.bootstrap', has_more: false });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  afterEach(() => {
    useAuthStore.setState({ user: null });
    vi.clearAllMocks();
  });

  it('bootstraps without a client clock, then maps a versioned state snapshot', async () => {
    renderHook(() => useCrossDevicePoll(true), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/articles/changes'));
    vi.mocked(apiFetch).mockResolvedValue({
      items: [{
        article_id: 42,
        is_read: true,
        is_starred: false,
        state_version: { changed_at_micros: '100', article_id: 42 },
      }],
      next_cursor: 'sc1.next',
      has_more: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(applyArticleStateChange).toHaveBeenCalled());
    expect(applyArticleStateChange.mock.calls[0][1]).toMatchObject({
      articleId: 42, is_read: true,
    });
  });

  it('drains every has_more page from the same opaque cursor', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ items: [], next_cursor: 'sc1.bootstrap', has_more: false })
      .mockResolvedValueOnce({
      items: [
        { article_id: 1, is_read: true, is_starred: false, state_version: { changed_at_micros: '101', article_id: 1 } },
      ],
      next_cursor: 'sc1.page1', has_more: true,
    })
      .mockResolvedValueOnce({
        items: [{ article_id: 2, is_read: false, is_starred: true, state_version: { changed_at_micros: '102', article_id: 2 } }],
        next_cursor: 'sc1.page2', has_more: false,
      });
    renderHook(() => useCrossDevicePoll(true), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(applyArticleStateChange).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/articles/changes?cursor=sc1.bootstrap');
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/articles/changes?cursor=sc1.page1');
  });

  it('bootstraps a fresh cursor when the authenticated owner changes', async () => {
    const firstUser: User = {
      id: 1,
      github_username: 'first',
      role: 'user',
      native_language: 'en',
      density_pref: 'comfortable',
      theme_pref: 'system',
    };
    useAuthStore.setState({ user: firstUser });
    renderHook(() => useCrossDevicePoll(true), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    act(() => useAuthStore.setState({ user: { ...firstUser, id: 2, github_username: 'second' } }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/articles/changes');
  });
});
