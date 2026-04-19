const CHANNEL_NAME = 'xreader';

export type BroadcastMessage =
  | {
      type: 'article-state';
      articleId: number;
      isRead?: boolean;
      isStarred?: boolean;
      origin: string;
    }
  | { type: 'invalidate'; queryKey: string[] };

let channel: BroadcastChannel | null = null;
const tabId =
  typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : Math.random().toString(36);

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcast(msg: BroadcastMessage) {
  getChannel()?.postMessage({ ...msg, origin: tabId });
}

export function onBroadcast(
  handler: (msg: BroadcastMessage & { origin: string }) => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data?.origin === tabId) return;
    handler(e.data);
  };
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}

export function getTabId() {
  return tabId;
}
