export type StateVersion = {
  changed_at_micros: string;
  article_id: number;
};

export type ArticleStateSnapshot = {
  article_id: number;
  is_read: boolean;
  is_starred: boolean;
  state_version?: StateVersion | null;
};

export type ReadSyncState = {
  confirmed: boolean;
  serverVersion: StateVersion | null;
  desired: boolean;
  pending: boolean;
  intentGeneration: number;
  intentBaseVersion: StateVersion | null;
  syncStatus: 'idle' | 'syncing' | 'unsynced';
};

type Entry = ReadSyncState & { tail: Promise<void> };

type Transport = {
  patch: (articleId: number, isRead: boolean) => Promise<ArticleStateSnapshot>;
  get: (articleId: number) => Promise<ArticleStateSnapshot>;
};

type Listener = (articleId: number, state: ReadSyncState) => void;
type AuthoritativeListener = (snapshot: ArticleStateSnapshot) => void;

export function compareStateVersions(left: StateVersion | null | undefined, right: StateVersion | null | undefined): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const leftMicros = BigInt(left.changed_at_micros);
  const rightMicros = BigInt(right.changed_at_micros);
  if (leftMicros < rightMicros) return -1;
  if (leftMicros > rightMicros) return 1;
  return left.article_id === right.article_id ? 0 : left.article_id < right.article_id ? -1 : 1;
}

export class ReadStateCoordinator {
  private readonly entries = new Map<number, Entry>();
  private readonly snapshots = new Map<number, ReadSyncState>();
  private readonly listeners = new Set<Listener>();
  private readonly authoritativeListeners = new Set<AuthoritativeListener>();

  constructor(private readonly transport: Transport) {}

  get(articleId: number): ReadSyncState | undefined {
    const snapshot = this.snapshots.get(articleId);
    if (snapshot) return snapshot;
    const entry = this.entries.get(articleId);
    if (!entry) return undefined;
    const created = this.publicState(entry);
    this.snapshots.set(articleId, created);
    return created;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onAuthoritative(listener: AuthoritativeListener): () => void {
    this.authoritativeListeners.add(listener);
    return () => this.authoritativeListeners.delete(listener);
  }

  seed(snapshot: ArticleStateSnapshot): void {
    const existing = this.entries.get(snapshot.article_id);
    const version = snapshot.state_version ?? null;
    if (!existing) {
      this.entries.set(snapshot.article_id, {
        confirmed: snapshot.is_read,
        desired: snapshot.is_read,
        pending: false,
        intentGeneration: 0,
        intentBaseVersion: version,
        serverVersion: version,
        syncStatus: 'idle',
        tail: Promise.resolve(),
      });
      this.emit(snapshot.article_id);
      return;
    }
    if (!version && (existing.serverVersion || existing.pending)) return;
    this.applyRemote(snapshot);
  }

  applyRemote(snapshot: ArticleStateSnapshot): void {
    const entry = this.entries.get(snapshot.article_id);
    if (!entry) {
      this.seed(snapshot);
      return;
    }
    const version = snapshot.state_version ?? null;
    if (!version && (entry.serverVersion || entry.pending)) return;
    if (version && compareStateVersions(version, entry.serverVersion) <= 0) return;

    entry.confirmed = snapshot.is_read;
    entry.serverVersion = version;
    if (!entry.pending) {
      entry.desired = snapshot.is_read;
      entry.intentBaseVersion = version;
      entry.syncStatus = 'idle';
    }
    this.emit(snapshot.article_id);
  }

  setDesired(articleId: number, desired: boolean): Promise<void> {
    let entry = this.entries.get(articleId);
    if (!entry) {
      this.seed({ article_id: articleId, is_read: false, is_starred: false });
      entry = this.entries.get(articleId)!;
    }
    if (entry.desired === desired && !entry.pending) return Promise.resolve();

    entry.intentGeneration += 1;
    const generation = entry.intentGeneration;
    entry.intentBaseVersion = entry.serverVersion;
    entry.desired = desired;
    entry.pending = true;
    entry.syncStatus = 'syncing';
    this.emit(articleId);

    const operation = entry.tail.then(() => this.submit(articleId, generation, desired));
    entry.tail = operation.catch(() => undefined);
    return operation;
  }

  async retryUnsynced(): Promise<void> {
    const retries: Promise<void>[] = [];
    for (const [articleId, entry] of this.entries) {
      if (entry.syncStatus === 'unsynced') {
        retries.push(this.setDesired(articleId, entry.desired));
      }
    }
    await Promise.all(retries);
  }

  private async submit(articleId: number, generation: number, desired: boolean): Promise<void> {
    try {
      const response = await this.transport.patch(articleId, desired);
      this.authoritativeListeners.forEach((listener) => listener(response));
      this.finish(articleId, generation, response);
    } catch {
      const entry = this.entries.get(articleId);
      if (entry && generation === entry.intentGeneration) {
        entry.syncStatus = 'syncing';
        this.emit(articleId);
      }
      try {
        const authoritative = await this.transport.get(articleId);
        this.authoritativeListeners.forEach((listener) => listener(authoritative));
        this.finish(articleId, generation, authoritative);
      } catch {
        const current = this.entries.get(articleId);
        if (current && generation === current.intentGeneration) {
          current.pending = true;
          current.syncStatus = 'unsynced';
          this.emit(articleId);
        }
      }
    }
  }

  private finish(articleId: number, generation: number, snapshot: ArticleStateSnapshot): void {
    const entry = this.entries.get(articleId);
    if (!entry) return;
    const responseVersion = snapshot.state_version ?? null;
    const alreadyHasNewer = compareStateVersions(entry.serverVersion, responseVersion) > 0;
    if (!alreadyHasNewer) {
      entry.confirmed = snapshot.is_read;
      entry.serverVersion = responseVersion;
    }

    if (generation === entry.intentGeneration) {
      entry.desired = entry.confirmed;
      entry.pending = false;
      entry.syncStatus = 'idle';
      entry.intentBaseVersion = entry.serverVersion;
    }
    this.emit(articleId);
  }

  private publicState(entry: Entry): ReadSyncState {
    return {
      confirmed: entry.confirmed,
      serverVersion: entry.serverVersion,
      desired: entry.desired,
      pending: entry.pending,
      intentGeneration: entry.intentGeneration,
      intentBaseVersion: entry.intentBaseVersion,
      syncStatus: entry.syncStatus,
    };
  }

  private emit(articleId: number): void {
    const entry = this.entries.get(articleId);
    if (!entry) return;
    const state = this.publicState(entry);
    this.snapshots.set(articleId, state);
    this.listeners.forEach((listener) => listener(articleId, state));
  }
}
