'use client';

import { useState, useEffect, useCallback } from 'react';
import { computeAnchor, type HighlightAnchor } from './highlightAnchor';
import { createHighlight } from '@/lib/queries/highlights';

interface Props {
  articleId: number;
  onHighlightCreated?: () => void;
}

export function HighlightToolbar({ articleId, onHighlightCreated }: Props) {
  const [anchor, setAnchor] = useState<HighlightAnchor | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setAnchor(null);
      setPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const computed = computeAnchor(range);
    if (!computed) {
      setAnchor(null);
      setPosition(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setAnchor(computed);
    setPosition({
      top: rect.top + window.scrollY - 40,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const save = async (withNote: boolean) => {
    if (!anchor) return;
    const note = withNote ? prompt('添加笔记：') ?? undefined : undefined;
    await createHighlight({
      article_id: articleId,
      ...anchor,
      note,
    });
    setAnchor(null);
    setPosition(null);
    window.getSelection()?.removeAllRanges();
    onHighlightCreated?.();
  };

  if (!anchor || !position) return null;

  return (
    <div
      className="fixed z-50 flex gap-1 rounded-lg border border-[#e6dec8] bg-white px-2 py-1 shadow-md"
      style={{ top: position.top, left: position.left, transform: 'translateX(-50%)' }}
    >
      <button
        onClick={() => save(false)}
        className="rounded px-2 py-1 text-xs font-medium text-[#4a4338] hover:bg-[#f5f0e8]"
      >
        高亮
      </button>
      <button
        onClick={() => save(true)}
        className="rounded px-2 py-1 text-xs font-medium text-[#4a4338] hover:bg-[#f5f0e8]"
      >
        高亮 + 笔记
      </button>
    </div>
  );
}
