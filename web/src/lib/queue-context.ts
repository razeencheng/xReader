import type { ArticleTab } from '@/lib/types';
import type { ReadFilter, ViewTab } from '@/stores/useUIStore';

export type QueueContext = {
  tab: ArticleTab;
  sourceId: number | null;
  readFilter: ReadFilter;
};

export function contextFromView(currentView: ViewTab, selectedSourceId: number | null, readFilter: ReadFilter): QueueContext {
  if (currentView === 'starred') return { tab: 'starred', sourceId: null, readFilter: 'all' };
  if (currentView === 'today') return { tab: 'today', sourceId: null, readFilter };
  if (currentView === 'sources') return { tab: 'stream', sourceId: selectedSourceId, readFilter };
  return { tab: 'stream', sourceId: null, readFilter };
}

function isArticleTab(value: string | null): value is ArticleTab {
  return value === 'today' || value === 'stream' || value === 'starred';
}

function isReadFilter(value: string | null): value is ReadFilter {
  return value === 'all' || value === 'unread' || value === 'read';
}

export function parseQueueContext(params: URLSearchParams, fallback: QueueContext): QueueContext {
  const tab = params.get('ctx');
  const readFilter = params.get('read');
  if (!isArticleTab(tab) || !isReadFilter(readFilter)) return fallback;

  const sourceRaw = params.get('source');
  let parsedSource: number | null = null;
  if (sourceRaw != null) {
    const candidate = Number(sourceRaw);
    if (!Number.isSafeInteger(candidate) || candidate <= 0) return fallback;
    parsedSource = candidate;
  }
  return {
    tab,
    sourceId: tab === 'stream' ? parsedSource : null,
    readFilter: tab === 'starred' ? 'all' : readFilter,
  };
}

export function writeQueueContext(params: URLSearchParams, context: QueueContext): void {
  params.set('ctx', context.tab);
  if (context.tab === 'stream' && context.sourceId != null) {
    params.set('source', String(context.sourceId));
  } else {
    params.delete('source');
  }
  params.set('read', context.tab === 'starred' ? 'all' : context.readFilter);
}

export function queueContextsEqual(left: QueueContext, right: QueueContext): boolean {
  return left.tab === right.tab && left.sourceId === right.sourceId && left.readFilter === right.readFilter;
}
