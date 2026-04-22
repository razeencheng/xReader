'use client';

import { useEffect, useState } from 'react';
import { computeAnchor, type HighlightAnchor } from './highlightAnchor';
import { createHighlight } from '@/lib/queries/highlights';

interface Props {
  articleId: number;
  onHighlightCreated?: () => void;
}

import { Highlighter, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function HighlightToolbar({ articleId, onHighlightCreated }: Props) {
  const [anchor, setAnchor] = useState<HighlightAnchor | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
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
        top: rect.top - 50, // 50px above selection
        left: rect.left + rect.width / 2,
      });
    };

    document.addEventListener('pointerup', handlePointerUp);
    return () => document.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const save = async (withNote: boolean) => {
    if (!anchor) return;
    const note = withNote ? prompt('Enter note:') ?? undefined : undefined;
    await createHighlight({
      article_id: articleId,
      layer: anchor.layer,
      paragraph_index: anchor.paragraph_index,
      text_start_offset: anchor.text_start_offset,
      text_end_offset: anchor.text_end_offset,
      quoted_text: anchor.quoted_text,
      note,
    });
    setAnchor(null);
    setPosition(null);
    window.getSelection()?.removeAllRanges();
    onHighlightCreated?.();
  };

  return (
    <AnimatePresence>
      {anchor && position && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          className="fixed z-[100] flex items-center gap-1 p-1 bg-[color-mix(in_oklch,var(--bg-panel)_85%,transparent)] backdrop-blur-xl border border-[var(--border)] rounded-full shadow-2xl"
          style={{ top: position.top, left: position.left, transform: 'translateX(-50%)' }}
        >
          <button
            onClick={() => save(false)}
            className="p-2 text-[var(--accent)] hover:bg-[var(--accent-bg)] rounded-full transition-colors"
            title="Highlight Selection"
          >
            <Highlighter size={16} strokeWidth={2.5} />
          </button>
          <div className="w-[1px] h-4 bg-[var(--border)]" />
          <button
            onClick={() => save(true)}
            className="p-2 text-[var(--accent)] hover:bg-[var(--accent-bg)] rounded-full transition-colors"
            title="Highlight with Note"
          >
            <MessageSquare size={16} strokeWidth={2.5} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
