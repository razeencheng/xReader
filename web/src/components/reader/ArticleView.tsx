'use client';

import { useMemo, useState } from 'react';
import { ArticleReader } from '@/components/reader/ArticleReader';
import { NextUpCard } from '@/components/reader/NextUpCard';
import type { AdvanceMode, AdvancePhase } from '@/lib/reader-advance';
import type { ArticleItem } from '@/lib/types';

interface ArticleViewProps {
  id: string;
  onClose?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onNotFound?: () => void;
  className?: string;
  next?: ArticleItem | null;
  position?: number;
  total?: number;
  onAdvance?: () => void;
  advanceMode?: AdvanceMode;
  advancePhase?: AdvancePhase;
}

export function ArticleView({
  id,
  onClose,
  onNext,
  onPrev,
  onNotFound,
  className = '',
  next,
  position,
  total,
  onAdvance,
  advanceMode = 'none',
  advancePhase = 'idle',
}: ArticleViewProps) {
  const [nextCardVisible, setNextCardVisible] = useState(false);

  // Intentionally keyed on primitives, not the `next` object identity:
  // filteredItems can produce a new ArticleItem reference for the same article
  // on list refreshes; keying on id+language prevents churning the hook
  // effects (which would reset the 1s dwell debounce in useNextArticleWarmup).
  const nextForWarmup = useMemo(
    () => (next ? { id: next.id, language: next.language } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [next?.id, next?.language],
  );

  return (
    <ArticleReader
      id={id}
      onClose={onClose}
      onNext={onNext}
      onPrev={onPrev}
      onNotFound={onNotFound}
      className={className}
      position={position}
      total={total}
      next={nextForWarmup}
      advanceMode={advanceMode}
      advancePhase={advancePhase}
      onAdvance={onAdvance}
      advanceHidden={nextCardVisible}
      afterBody={
        next && onAdvance ? (
          <div className="mt-16 mb-12">
            <NextUpCard next={next} onAdvance={onAdvance} onVisibilityChange={setNextCardVisible} />
          </div>
        ) : undefined
      }
    />
  );
}
