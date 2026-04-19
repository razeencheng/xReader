export interface HighlightAnchor {
  layer: 'original' | 'translation';
  paragraph_index: number;
  text_start_offset: number;
  text_end_offset: number;
  quoted_text: string;
}

export function computeAnchor(range: Range): HighlightAnchor | null {
  const startContainer = range.startContainer;
  const paragraphEl = findParagraphElement(startContainer);
  if (!paragraphEl) return null;

  const indexStr = paragraphEl.getAttribute('data-paragraph-index');
  if (indexStr == null) return null;

  const layer = paragraphEl.closest('[data-layer]')?.getAttribute('data-layer') as 'original' | 'translation' | null;

  const fullText = paragraphEl.textContent ?? '';
  const quotedText = range.toString();
  if (!quotedText.trim()) return null;

  const textOffset = getTextOffset(paragraphEl, range.startContainer, range.startOffset);
  const endOffset = textOffset + quotedText.length;

  return {
    layer: layer ?? 'original',
    paragraph_index: parseInt(indexStr, 10),
    text_start_offset: textOffset,
    text_end_offset: endOffset,
    quoted_text: quotedText,
  };
}

function findParagraphElement(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute('data-paragraph-index')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += (node.textContent ?? '').length;
  }
  return offset + targetOffset;
}
