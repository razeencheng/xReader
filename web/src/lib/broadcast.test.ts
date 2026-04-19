import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockBroadcastChannel {
  name: string;
  listeners: Array<(e: MessageEvent) => void> = [];
  static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown) {
    MockBroadcastChannel.instances
      .filter((ch) => ch !== this && ch.name === this.name)
      .forEach((ch) => ch.listeners.forEach((fn) => fn({ data } as MessageEvent)));
  }

  addEventListener(_: string, fn: (e: MessageEvent) => void) {
    this.listeners.push(fn);
  }

  removeEventListener(_: string, fn: (e: MessageEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  close() {}
}

describe('broadcast', () => {
  beforeEach(() => {
    MockBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  });

  it('should broadcast messages between tabs', async () => {
    vi.resetModules();
    const { broadcast, onBroadcast } = await import('./broadcast');

    const received: Array<{ articleId?: number }> = [];
    onBroadcast((msg) => received.push(msg));

    const otherTab = new MockBroadcastChannel('xreader');
    otherTab.postMessage({ type: 'article-state', articleId: 1, isRead: true, origin: 'other-tab' });

    expect(received).toHaveLength(1);
    expect(received[0].articleId).toBe(1);

    broadcast({ type: 'invalidate', queryKey: ['articles'] });
    expect(received).toHaveLength(1);
  });
});
