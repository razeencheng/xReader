import { describe, expect, test } from 'vitest';
import { resolveAdvanceMode, shouldUndoNavigate } from './reader-advance';

describe('reader advance state', () => {
  test('distinguishes known next, pagination, final completion, and none', () => {
    expect(resolveAdvanceMode({ hasCurrent: true, hasKnownNext: true, hasNextPage: false, desiredRead: false })).toBe('next');
    expect(resolveAdvanceMode({ hasCurrent: true, hasKnownNext: false, hasNextPage: true, desiredRead: false })).toBe('load-next');
    expect(resolveAdvanceMode({ hasCurrent: true, hasKnownNext: false, hasNextPage: false, desiredRead: false })).toBe('complete-current');
    expect(resolveAdvanceMode({ hasCurrent: true, hasKnownNext: false, hasNextPage: false, desiredRead: true })).toBe('none');
    expect(resolveAdvanceMode({ hasCurrent: false, hasKnownNext: false, hasNextPage: true, desiredRead: false })).toBe('none');
  });

  test('undo navigation requires target, queue context, and action generation to match', () => {
    const base = {
      currentId: 2,
      targetId: 2,
      currentContextKey: 'stream:42:unread',
      actionContextKey: 'stream:42:unread',
      currentGeneration: 8,
      actionGeneration: 8,
    };
    expect(shouldUndoNavigate(base)).toBe(true);
    expect(shouldUndoNavigate({ ...base, currentId: 3 })).toBe(false);
    expect(shouldUndoNavigate({ ...base, currentContextKey: 'today::unread' })).toBe(false);
    expect(shouldUndoNavigate({ ...base, currentGeneration: 9 })).toBe(false);
  });
});
