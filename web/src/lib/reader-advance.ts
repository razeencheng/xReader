export type AdvanceMode = 'next' | 'load-next' | 'complete-current' | 'none';
export type AdvancePhase = 'idle' | 'loading' | 'mutating' | `navigating:${number}` | 'observed';

export function resolveAdvanceMode(input: {
  hasCurrent: boolean;
  hasKnownNext: boolean;
  hasNextPage: boolean;
  desiredRead: boolean;
}): AdvanceMode {
  if (!input.hasCurrent) return 'none';
  if (input.hasKnownNext) return 'next';
  if (input.hasNextPage) return 'load-next';
  return input.desiredRead ? 'none' : 'complete-current';
}

export function queueContextKey(context: { tab: string; sourceId: number | null; readFilter: string }): string {
  return `${context.tab}:${context.sourceId ?? ''}:${context.readFilter}`;
}

export function shouldUndoNavigate(input: {
  currentId: number | null;
  targetId: number;
  currentContextKey: string;
  actionContextKey: string;
  currentGeneration: number;
  actionGeneration: number;
}): boolean {
  return input.currentId === input.targetId
    && input.currentContextKey === input.actionContextKey
    && input.currentGeneration === input.actionGeneration;
}
