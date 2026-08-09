import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const readerProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('@/components/reader/ArticleReader', () => ({
  ArticleReader: (props: { afterBody?: ReactNode }) => {
    readerProps.current = props as Record<string, unknown>;
    return <div>{props.afterBody}</div>;
  },
}));

import { ArticleView } from './ArticleView';

const nextStub = {
  id: 8,
  title: 'Next',
  source_id: 1,
  link: '',
  language: 'en',
  published_at: new Date().toISOString(),
};

describe('ArticleView advance plumbing', () => {
  it('forwards stable next metadata and reader position', () => {
    render(<ArticleView id="7" next={nextStub} position={2} total={10} />);

    expect(readerProps.current?.next).toEqual({ id: 8, language: 'en' });
    expect(readerProps.current?.position).toBe(2);
    expect(readerProps.current?.total).toBe(10);
  });

  it('passes null next to ArticleReader when there is no next', () => {
    render(<ArticleView id="7" />);
    expect(readerProps.current?.next).toBeNull();
  });

  it('delegates the end card to the page-owned compound advance action', async () => {
    const onAdvance = vi.fn();
    render(<ArticleView id="7" next={nextStub} onAdvance={onAdvance} advanceMode="next" />);

    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
