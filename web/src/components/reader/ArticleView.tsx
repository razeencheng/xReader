'use client';

import { ArticleReader } from '@/components/reader/ArticleReader';

interface ArticleViewProps {
  id: string;
  onClose?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  className?: string;
}

export function ArticleView({ id, onClose, onNext, onPrev, className = '' }: ArticleViewProps) {
  return (
    <ArticleReader
      id={id}
      onClose={onClose}
      onNext={onNext}
      onPrev={onPrev}
      className={className}
    />
  );
}
