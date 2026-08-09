import { describe, expect, test } from 'vitest';
import { parseSummary } from './summary';

describe('parseSummary', () => {
  test('parses an exact V1 lead and two to four points', () => {
    expect(parseSummary('XREADER_SUMMARY_V1\nLEAD: Main idea\nPOINT: First\nPOINT: Second', 'en')).toEqual({
      kind: 'structured',
      lead: 'Main idea',
      points: ['First', 'Second'],
    });
  });

  test('does not treat malformed V1 as structured content', () => {
    const text = 'XREADER_SUMMARY_V1\nLEAD: Main idea\nPOINT: Only one';
    const parsed = parseSummary(text, 'en');
    expect(parsed.kind).toBe('legacy');
    expect(parsed.kind === 'legacy' ? parsed.paragraphs.join('\n') : '').toContain('Only one');
  });

  test('splits a CJK historical summary into at most three lossless paragraphs', () => {
    const text = '第一句说明背景。第二句给出变化！第三句解释影响？第四句给出结论。';
    const parsed = parseSummary(text, 'zh-CN');
    expect(parsed.kind).toBe('legacy');
    if (parsed.kind !== 'legacy') return;
    expect(parsed.paragraphs).toHaveLength(3);
    expect(parsed.paragraphs.join('')).toBe(text);
  });

  test('splits a space-delimited historical summary without dropping punctuation', () => {
    const text = 'First sentence explains the context. Second sentence states the change! Third sentence explains the impact?';
    const parsed = parseSummary(text, 'en');
    expect(parsed).toEqual({
      kind: 'legacy',
      paragraphs: [
        'First sentence explains the context.',
        'Second sentence states the change!',
        'Third sentence explains the impact?',
      ],
    });
  });

  test('preserves text when no reliable sentence boundary exists', () => {
    const text = 'a compact summary with no terminal punctuation';
    expect(parseSummary(text, 'en')).toEqual({ kind: 'legacy', paragraphs: [text] });
  });
});
