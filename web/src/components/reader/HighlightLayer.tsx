'use client';

import { useEffect, useState } from 'react';
import { fetchHighlights, deleteHighlight, updateHighlightNote, type Highlight } from '@/lib/queries/highlights';

interface Props {
  articleId: number;
  refreshKey?: number;
}

export function HighlightLayer({ articleId, refreshKey }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    fetchHighlights(articleId)
      .then(setHighlights)
      .catch(() => {});
  }, [articleId, refreshKey]);

  useEffect(() => {
    if (highlights.length === 0) return;

    highlights.forEach((h) => {
      const paragraphEl = document.querySelector(`[data-paragraph-index="${h.paragraph_index}"]`);
      if (!paragraphEl) return;

      const walker = document.createTreeWalker(paragraphEl, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node: Node | null;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      while ((node = walker.nextNode())) {
        const len = (node.textContent ?? '').length;
        if (!startNode && offset + len > h.text_start_offset) {
          startNode = node;
          startOffset = h.text_start_offset - offset;
        }
        if (!endNode && offset + len >= h.text_end_offset) {
          endNode = node;
          endOffset = h.text_end_offset - offset;
          break;
        }
        offset += len;
      }

      if (startNode && endNode) {
        try {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);

          const mark = document.createElement('mark');
          mark.className = 'bg-yellow-100/60 cursor-pointer';
          mark.dataset.highlightId = String(h.id);
          if (h.note) mark.title = h.note;
          range.surroundContents(mark);
        } catch {}
      }
    });
  }, [highlights]);

  return null;
}
