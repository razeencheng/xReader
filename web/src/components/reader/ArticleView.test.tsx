import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('ctx=today'),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/broadcast', () => ({ broadcast: vi.fn() }));
const applyArticleStateChange = vi.fn();
vi.mock('@/lib/article-state-cache', () => ({
  applyArticleStateChange: (...a: unknown[]) => applyArticleStateChange(...a),
}));
vi.mock('@/components/reader/ArticleReader', () => ({
  ArticleReader: ({ afterBody }: { afterBody?: ReactNode }) => <div>{afterBody}</div>,
}));

import { apiFetch } from '@/lib/api-client';
import { ArticleView } from './ArticleView';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const nextStub = { id: 8, title: 'Next', source_id: 1, link: '', language: 'en', published_at: new Date().toISOString() };

describe('ArticleView.markRead', () => {
  beforeEach(() => {
    push.mockReset();
    applyArticleStateChange.mockClear();
    vi.mocked(apiFetch).mockReset().mockResolvedValue({});
  });

  it('updates the cache via applyArticleStateChange when NextUpCard advances', async () => {
    render(<ArticleView id="7" next={nextStub as never} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(applyArticleStateChange).toHaveBeenCalledWith(expect.anything(), { articleId: 7, is_read: true });
  });

  it('rolls back to the previous cached state when the PATCH fails', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network'));
    render(<ArticleView id="7" next={nextStub as never} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(applyArticleStateChange).toHaveBeenNthCalledWith(1, expect.anything(), { articleId: 7, is_read: true });
    expect(applyArticleStateChange).toHaveBeenNthCalledWith(2, expect.anything(), { articleId: 7, is_read: false });
  });

  it('reads previous state from cache: skips PATCH/optimistic when already read, still navigates', async () => {
    const client = new QueryClient();
    client.setQueryData(['article', '7'], { id: 7, is_read: true });
    render(
      <QueryClientProvider client={client}>
        <ArticleView id="7" next={nextStub as never} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(applyArticleStateChange).not.toHaveBeenCalled();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
  });
});
