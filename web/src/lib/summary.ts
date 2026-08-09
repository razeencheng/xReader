export type ParsedSummary =
  | { kind: 'structured'; lead: string; points: string[] }
  | { kind: 'bulleted'; points: string[] }
  | { kind: 'legacy'; paragraphs: string[] };

const V1_HEADER = 'XREADER_SUMMARY_V1';

function parseV1(text: string): ParsedSummary | null {
  const lines = text.split('\n').map((line) => line.trim());
  if (lines[0] !== V1_HEADER) return null;
  if (lines.some((line) => line === '')) return null;

  const leadLines = lines.slice(1).filter((line) => line.startsWith('LEAD: '));
  const pointLines = lines.slice(1).filter((line) => line.startsWith('POINT: '));
  if (leadLines.length !== 1 || pointLines.length < 2 || pointLines.length > 4) return null;
  if (lines.length !== 2 + pointLines.length || !lines[1].startsWith('LEAD: ')) return null;
  if (lines.slice(2).some((line) => !line.startsWith('POINT: '))) return null;

  const lead = leadLines[0].slice('LEAD: '.length).trim();
  const points = pointLines.map((line) => line.slice('POINT: '.length).trim());
  if (!lead || points.some((point) => !point)) return null;
  return { kind: 'structured', lead, points };
}

function parseLegacyBullets(text: string): ParsedSummary | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const points = lines.map((line) => {
    const match = line.match(/^(?:[•·▪◦]\s*|[-*+]\s+|\d+[.)、]\s*|[①-⑳]\s*)(.+)$/);
    return match?.[1].trim() ?? null;
  });
  if (points.some((point) => !point)) return null;
  return { kind: 'bulleted', points: points as string[] };
}

function fallbackSentences(text: string): string[] {
  const matches = text.match(/[^.!?。！？]+(?:[.!?。！？]+(?:[”’」』】）)]*)|$)/g);
  return matches?.map((part) => part.trimStart()).filter(Boolean) ?? [];
}

function segmentSentences(text: string, locale: string): string[] {
  try {
    if (typeof Intl.Segmenter === 'function') {
      const parts = Array.from(
        new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text),
        ({ segment }) => segment.trim(),
      ).filter(Boolean);
      if (parts.length > 1) return parts;
    }
  } catch {
    // Invalid/unsupported locale: use the punctuation-preserving fallback.
  }
  return fallbackSentences(text);
}

function groupIntoParagraphs(sentences: string[]): string[] {
  if (sentences.length <= 3) return sentences;

  const paragraphCount = 3;
  const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const paragraphs: string[] = [];
  let current = '';
  let consumed = 0;

  for (let index = 0; index < sentences.length; index += 1) {
    current += sentences[index];
    consumed += sentences[index].length;
    const remainingSentences = sentences.length - index - 1;
    const remainingParagraphs = paragraphCount - paragraphs.length - 1;
    const target = (totalLength * (paragraphs.length + 1)) / paragraphCount;
    if (remainingParagraphs > 0 && remainingSentences >= remainingParagraphs && consumed >= target) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function cleanMalformedV1(text: string): string {
  if (!text.startsWith(V1_HEADER)) return text;
  return text
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^(?:LEAD|POINT):\s*/, ''))
    .filter(Boolean)
    .join('\n');
}

export function parseSummary(text: string, locale: string): ParsedSummary {
  const trimmed = text.trim();
  const structured = parseV1(trimmed);
  if (structured) return structured;

  const fallback = cleanMalformedV1(trimmed);
  const bulleted = parseLegacyBullets(fallback);
  if (bulleted) return bulleted;

  const sentences = segmentSentences(fallback, locale);
  if (sentences.length <= 1) return { kind: 'legacy', paragraphs: [fallback] };
  return { kind: 'legacy', paragraphs: groupIntoParagraphs(sentences) };
}
