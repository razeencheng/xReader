import { describe, expect, test, vi } from 'vitest';
import { ReadStateCoordinator, type ArticleStateSnapshot } from './read-state-coordinator';

function snapshot(articleId: number, isRead: boolean, micros: string): ArticleStateSnapshot {
  return {
    article_id: articleId,
    is_read: isRead,
    is_starred: false,
    state_version: { changed_at_micros: micros, article_id: articleId },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('ReadStateCoordinator', () => {
  test('serializes local generations without letting an old response overwrite desired state', async () => {
    const first = deferred<ArticleStateSnapshot>();
    const second = deferred<ArticleStateSnapshot>();
    const patch = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const coordinator = new ReadStateCoordinator({ patch, get: vi.fn() });
    coordinator.seed(snapshot(1, false, '10'));

    const markRead = coordinator.setDesired(1, true);
    const undo = coordinator.setDesired(1, false);
    expect(coordinator.get(1)).toMatchObject({ desired: false, pending: true, intentGeneration: 2 });
    await Promise.resolve();
    expect(patch).toHaveBeenCalledTimes(1);

    first.resolve(snapshot(1, true, '11'));
    await markRead;
    await Promise.resolve();
    expect(patch).toHaveBeenCalledTimes(2);
    expect(coordinator.get(1)?.desired).toBe(false);

    second.resolve(snapshot(1, false, '12'));
    await undo;
    expect(coordinator.get(1)).toMatchObject({ confirmed: false, desired: false, pending: false, syncStatus: 'idle' });
  });

  test('accepts a newer remote version and does not replay an older local desire', async () => {
    const response = deferred<ArticleStateSnapshot>();
    const patch = vi.fn(() => response.promise);
    const coordinator = new ReadStateCoordinator({ patch, get: vi.fn() });
    coordinator.seed(snapshot(2, false, '20'));

    const local = coordinator.setDesired(2, true);
    coordinator.applyRemote(snapshot(2, false, '22'));
    response.resolve(snapshot(2, true, '21'));
    await local;

    expect(patch).toHaveBeenCalledTimes(1);
    expect(coordinator.get(2)).toMatchObject({ confirmed: false, desired: false, pending: false });
  });

  test('ignores older remote and unversioned snapshots once a baseline exists', () => {
    const coordinator = new ReadStateCoordinator({ patch: vi.fn(), get: vi.fn() });
    coordinator.seed(snapshot(3, true, '30'));
    coordinator.applyRemote(snapshot(3, false, '29'));
    coordinator.seed({ article_id: 3, is_read: false, is_starred: false });
    expect(coordinator.get(3)).toMatchObject({ confirmed: true, desired: true });
  });

  test('reconciles an unknown write result with authoritative GET', async () => {
    const patch = vi.fn().mockRejectedValue(new TypeError('network'));
    const get = vi.fn().mockResolvedValue(snapshot(4, true, '41'));
    const coordinator = new ReadStateCoordinator({ patch, get });
    coordinator.seed(snapshot(4, false, '40'));

    await coordinator.setDesired(4, true);

    expect(get).toHaveBeenCalledWith(4);
    expect(coordinator.get(4)).toMatchObject({ confirmed: true, desired: true, pending: false, syncStatus: 'idle' });
  });

  test('accepts an authoritative GET that confirms the write did not land', async () => {
    const coordinator = new ReadStateCoordinator({
      patch: vi.fn().mockRejectedValue(new TypeError('network')),
      get: vi.fn().mockResolvedValue(snapshot(6, false, '60')),
    });
    coordinator.seed(snapshot(6, false, '60'));

    await coordinator.setDesired(6, true);
    expect(coordinator.get(6)).toMatchObject({ confirmed: false, desired: false, pending: false, syncStatus: 'idle' });
  });

  test('keeps an honest unsynced state when write and authoritative read both fail', async () => {
    const coordinator = new ReadStateCoordinator({
      patch: vi.fn().mockRejectedValue(new TypeError('network')),
      get: vi.fn().mockRejectedValue(new TypeError('offline')),
    });
    coordinator.seed(snapshot(5, false, '50'));

    await coordinator.setDesired(5, true);

    expect(coordinator.get(5)).toMatchObject({ confirmed: false, desired: true, pending: true, syncStatus: 'unsynced' });
  });

  test('retries the latest desired state after connectivity returns', async () => {
    const patch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(snapshot(7, true, '71'));
    const get = vi.fn().mockRejectedValue(new TypeError('offline'));
    const coordinator = new ReadStateCoordinator({ patch, get });
    coordinator.seed(snapshot(7, false, '70'));

    await coordinator.setDesired(7, true);
    await coordinator.retryUnsynced();

    expect(patch).toHaveBeenCalledTimes(2);
    expect(coordinator.get(7)).toMatchObject({ confirmed: true, desired: true, pending: false, syncStatus: 'idle' });
  });
});
