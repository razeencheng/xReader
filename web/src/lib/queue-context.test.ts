import { describe, expect, test } from 'vitest';
import { contextFromView, parseQueueContext, writeQueueContext } from './queue-context';

describe('queue context', () => {
  test('normalizes all, source, today, and starred views', () => {
    expect(contextFromView('all', null, 'unread')).toEqual({ tab: 'stream', sourceId: null, readFilter: 'unread' });
    expect(contextFromView('sources', 42, 'read')).toEqual({ tab: 'stream', sourceId: 42, readFilter: 'read' });
    expect(contextFromView('today', null, 'all')).toEqual({ tab: 'today', sourceId: null, readFilter: 'all' });
    expect(contextFromView('starred', null, 'unread')).toEqual({ tab: 'starred', sourceId: null, readFilter: 'all' });
  });

  test('round-trips a complete source queue through URL parameters', () => {
    const params = new URLSearchParams('article=7');
    writeQueueContext(params, { tab: 'stream', sourceId: 42, readFilter: 'unread' });
    expect(params.toString()).toBe('article=7&ctx=stream&source=42&read=unread');
    expect(parseQueueContext(params, { tab: 'today', sourceId: null, readFilter: 'all' })).toEqual({
      tab: 'stream', sourceId: 42, readFilter: 'unread',
    });
  });

  test('uses the fallback only when an old URL has no complete context', () => {
    const fallback = { tab: 'today' as const, sourceId: null, readFilter: 'unread' as const };
    expect(parseQueueContext(new URLSearchParams('article=7&ctx=stream'), fallback)).toEqual(fallback);
  });
});
