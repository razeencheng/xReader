import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { NextUpCard } from './NextUpCard';
import type { ArticleItem } from '@/lib/types';

const next: ArticleItem = {
  id: 3,
  source_id: 1,
  title: 'Original headline',
  title_translated: '翻译后的标题',
  source_title: 'Cloudflare',
  published_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  link: '',
  language: 'en',
  summary: 'Summary text',
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

test('renders original subtitle when translated title exists', () => {
  render(<NextUpCard next={next} onAdvance={vi.fn()} />);

  expect(screen.getByText('翻译后的标题')).toBeInTheDocument();
  expect(screen.getByText('Original headline')).toBeInTheDocument();
  expect(screen.getByText('Cloudflare')).toBeInTheDocument();
});

test('delegates clicks without owning navigation or read-state mutation', async () => {
  const onAdvance = vi.fn();
  render(<NextUpCard next={next} onAdvance={onAdvance} />);

  await userEvent.click(screen.getByRole('button', { name: /翻译后的标题/i }));
  expect(onAdvance).toHaveBeenCalledTimes(1);
});

test('reports whether the end card is visible', () => {
  let observerCallback: IntersectionObserverCallback | undefined;
  const disconnect = vi.fn();
  class MockIntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    disconnect = disconnect;

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  const onVisibilityChange = vi.fn();

  const { unmount } = render(<NextUpCard next={next} onAdvance={vi.fn()} onVisibilityChange={onVisibilityChange} />);
  observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(onVisibilityChange).toHaveBeenCalledWith(true);

  unmount();
  expect(disconnect).toHaveBeenCalled();
  expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
});
