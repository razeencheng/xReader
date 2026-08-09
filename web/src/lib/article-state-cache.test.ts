import { describe, expect, test } from 'vitest';
import { coordinatedReadStateChange } from './article-state-cache';
import type { ReadSyncState } from './read-state-coordinator';

function coordinated(overrides: Partial<ReadSyncState> = {}): ReadSyncState {
  return {
    confirmed: true,
    desired: true,
    pending: false,
    intentGeneration: 1,
    intentBaseVersion: { changed_at_micros: '200', article_id: 7 },
    serverVersion: { changed_at_micros: '200', article_id: 7 },
    syncStatus: 'idle',
    ...overrides,
  };
}

describe('coordinatedReadStateChange', () => {
  test('repairs an unversioned stale list refetch with the coordinator state', () => {
    expect(coordinatedReadStateChange(
      { id: 7, is_read: false },
      coordinated(),
    )).toEqual({
      articleId: 7,
      is_read: true,
      state_version: { changed_at_micros: '200', article_id: 7 },
    });
  });

  test('keeps a pending local desired state visible', () => {
    expect(coordinatedReadStateChange(
      { id: 7, is_read: false, state_version: { changed_at_micros: '200', article_id: 7 } },
      coordinated({ confirmed: false, desired: true, pending: true, syncStatus: 'syncing' }),
    )?.is_read).toBe(true);
  });

  test('does nothing when list and coordinator agree', () => {
    expect(coordinatedReadStateChange(
      { id: 7, is_read: true, state_version: { changed_at_micros: '200', article_id: 7 } },
      coordinated(),
    )).toBeNull();
  });
});
