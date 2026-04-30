'use client';

import { ArticleReader } from '@/components/reader/ArticleReader';

interface ArticleViewProps {
  id: string;
  onClose?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onNotFound?: () => void;
  className?: string;
}

export function ArticleView({ id, onClose, onNext, onPrev, onNotFound, className = '' }: ArticleViewProps) {
  return (
    <ArticleReader
      id={id}
      onClose={onClose}
      onNext={onNext}
      onPrev={onPrev}
      onNotFound={onNotFound}
      className={className}
    />
  );
}
