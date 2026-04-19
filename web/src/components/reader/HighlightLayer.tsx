'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { deleteHighlight, fetchHighlights, updateHighlightNote, type Highlight } from '@/lib/queries/highlights';
import { HighlightToolbar } from './HighlightToolbar';

interface Props {
  articleId: number;
  refreshKey?: number;
  children?: ReactNode;
}

type ParagraphHighlight = Highlight & { top?: number };

export function HighlightLayer({ articleId, refreshKey, children }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchHighlights(articleId)
      .then((items) => {
        if (!cancelled) setHighlights(items);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [articleId, refreshKey]);

  const grouped = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const highlight of highlights) {
      const list = map.get(highlight.paragraph_index) ?? [];
      list.push(highlight);
      map.set(highlight.paragraph_index, list);
    }
    return map;
  }, [highlights]);

  useEffect(() => {
    const marks = Array.from(document.querySelectorAll('[data-highlight-id]')) as HTMLElement[];
    for (const mark of marks) {
      const parent = mark.parentElement;
      if (parent?.dataset.highlightContainer === 'true') {
        const text = mark.textContent ?? '';
        mark.replaceWith(document.createTextNode(text));
      }
    }

    for (const [paragraphIndex, paragraphHighlights] of grouped.entries()) {
      const paragraph = document.querySelector(`[data-paragraph-index="${paragraphIndex}"]`);
      if (!paragraph) continue;

      const textNodes: Array<{ node: Text; start: number; end: number }> = [];
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      let offset = 0;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        textNodes.push({ node: node as Text, start: offset, end: offset + text.length });
        offset += text.length;
      }

      paragraphHighlights.forEach((highlight) => {
        const range = document.createRange();
        const startNode = textNodes.find((entry) => highlight.text_start_offset >= entry.start && highlight.text_start_offset <= entry.end);
        const endNode = textNodes.find((entry) => highlight.text_end_offset >= entry.start && highlight.text_end_offset <= entry.end);
        if (!startNode || !endNode) return;

        range.setStart(startNode.node, highlight.text_start_offset - startNode.start);
        range.setEnd(endNode.node, highlight.text_end_offset - endNode.start);

        const mark = document.createElement('mark');
        mark.dataset.highlightId = String(highlight.id);
        mark.className = 'bg-[var(--bg-highlight-yellow)] cursor-pointer rounded-[2px] px-0.5';
        if (highlight.note) mark.title = highlight.note;
        try {
          range.surroundContents(mark);
        } catch {
          // Ignore invalid ranges on partially rendered DOM.
        }
      });
    }
  }, [grouped]);

  const reload = async () => {
    try {
      setHighlights(await fetchHighlights(articleId));
    } catch {
      // ignore
    }
  };

  const handleMarkContextMenu = async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest('mark[data-highlight-id]') as HTMLElement | null;
    if (!mark) return;

    event.preventDefault();
    const id = Number(mark.dataset.highlightId);
    const highlight = highlights.find((item) => item.id === id);
    if (!highlight) return;

    const action = window.prompt('输入 note / delete / copy', highlight.note ?? '');
    if (action == null) return;
    if (action === 'delete') {
      await deleteHighlight(id);
      await reload();
      return;
    }
    if (action === 'copy') {
      await navigator.clipboard.writeText(highlight.quoted_text);
      return;
    }
    if (action !== (highlight.note ?? '')) {
      await updateHighlightNote(id, action);
      await reload();
    }
  };

  return (
    <div onContextMenu={handleMarkContextMenu} data-highlight-container="true">
      <HighlightToolbar articleId={articleId} onHighlightCreated={reload} />
      {children}
    </div>
  );
}
