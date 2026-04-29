'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Upload } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import {
  useCreateSource,
  useDeleteSource,
  useRefreshSource,
  useRenameSource,
  useSourceImportJob,
  useSources,
} from '@/lib/queries/sources';
import type { Source } from '@/lib/types';

type MessageState = {
  kind: 'idle' | 'loading' | 'success' | 'error';
  text: string;
};

type AddSourceStatus = {
  kind: 'idle' | 'loading' | 'success' | 'error';
  title: string;
  detail?: string;
};

const ADD_SOURCE_STEP_KEYS = [
  'sources.stepCheckInput',
  'sources.stepParseFeed',
  'sources.stepSearchPage',
  'sources.stepCommonPaths',
] as const;

function timeAgo(iso: string | null, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!iso) return t('sources.never');

  const diffMinutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return t('sources.justNow');
  if (diffMinutes < 60) return t('sources.minutesAgo', { count: diffMinutes });

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t('sources.hoursAgo', { count: diffHours });

  return t('sources.daysAgo', { count: Math.floor(diffHours / 24) });
}

function truncateUrl(url: string, maxLength = 48) {
  if (url.length <= maxLength) return url;
  const visible = Math.max(8, maxLength - 1);
  return `${url.slice(0, visible)}…`;
}

function healthState(source: Source) {
  if (source.health === 'ok' || source.health === 'healthy') {
    return { label: 'healthy', dotClass: 'bg-emerald-500' };
  }

  if (source.health === 'warn' || source.health === 'degraded' || source.health === 'unknown') {
    return { label: 'degraded', dotClass: 'bg-amber-500' };
  }

  if (!source.health && source.consecutive_fails <= 0) {
    return { label: 'healthy', dotClass: 'bg-emerald-500' };
  }

  if (!source.health && source.consecutive_fails < 6) {
    return { label: 'degraded', dotClass: 'bg-amber-500' };
  }

  return { label: 'error', dotClass: 'bg-rose-500' };
}

function ProgressBar({
  progress,
  t,
}: {
  progress: number | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const percent = progress == null ? null : Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress));

  return (
    <div className="mt-3 space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-callout)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${percent ?? 18}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="font-[system-ui] text-xs text-[var(--text-muted)]">
        {percent == null ? t('sources.importProgressUnknown') : t('sources.importProgress', { percent: Math.round(percent) })}
      </p>
    </div>
  );
}

function AddSourceProgress({
  status,
  t,
}: {
  status: AddSourceStatus;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (status.kind === 'idle') {
    return null;
  }

  if (status.kind === 'loading') {
    return (
      <div className="mt-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-body)] px-4 py-3 font-[system-ui]">
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-body)]">
          <span>{status.title}</span>
          <span className="text-xs text-[var(--text-muted)]">{t('sources.autoDiscovering')}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-callout)]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {ADD_SOURCE_STEP_KEYS.map((stepKey) => (
            <div key={stepKey} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
              <span>{t(stepKey)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mt-3 rounded-2xl border px-4 py-3 font-[system-ui] text-sm ${
        status.kind === 'success'
          ? 'border-[var(--border-success)] bg-[var(--bg-badge-today)] text-[var(--text-success)]'
          : 'border-[var(--border-error)] bg-[var(--bg-highlight-error)] text-[var(--text-error)]'
      }`}
    >
      <div className="font-medium">{status.title}</div>
      {status.detail ? <div className="mt-1 break-all text-xs opacity-85">{status.detail}</div> : null}
    </div>
  );
}

export function SourcesPage() {
  const { t } = useI18n();
  const { data: sources, isLoading, isFetching } = useSources();
  const createSource = useCreateSource();
  const renameSource = useRenameSource();
  const deleteSource = useDeleteSource();
  const refreshSource = useRefreshSource();

  const [sourceUrl, setSourceUrl] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<MessageState>({ kind: 'idle', text: '' });
  const [addSourceStatus, setAddSourceStatus] = useState<AddSourceStatus>({ kind: 'idle', title: '' });
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const handledImportJobId = useRef<string | null>(null);

  const importJob = useSourceImportJob(importJobId);

  const visibleSources = useMemo(() => {
    if (!sources) return [];
    return sources.filter((source) => !deletedSourceIds.has(source.id));
  }, [deletedSourceIds, sources]);

  useEffect(() => {
    if (!importJobId || !importJob.data) return;
    if (handledImportJobId.current === importJobId) return;

    if (importJob.data.status === 'done') {
      handledImportJobId.current = importJobId;
      const timeoutId = window.setTimeout(() => {
        setImportJobId(null);
        setMessage({ kind: 'success', text: t('sources.importCompleteMessage') });
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (importJob.data.status === 'failed') {
      handledImportJobId.current = importJobId;
      const timeoutId = window.setTimeout(() => {
        setImportJobId(null);
        setMessage({ kind: 'error', text: t('sources.importFailedMessage') });
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [importJob.data, importJobId, t]);

  async function handleCreateSource() {
    const url = sourceUrl.trim();
    if (!url) return;

    setAddSourceStatus({
      kind: 'loading',
      title: t('sources.addSearching', { url }),
    });
    try {
      const source = await createSource.mutateAsync(url);
      setSourceUrl('');
      setAddSourceStatus({
        kind: 'success',
        title: t('sources.addFound', { title: source.title }),
        detail: t('sources.addFoundDetail', { url: source.url }),
      });
    } catch (error) {
      const raw = error instanceof ApiError ? error.message : '';
      const detail = raw === 'source already exists'
        ? t('sources.alreadyExists')
        : raw.includes('no RSS or Atom feed found')
          ? t('sources.noFeedFound')
          : raw || t('sources.noFeedFound');

      setAddSourceStatus({
        kind: 'error',
        title: t('sources.addFailed'),
        detail,
      });
    }
  }

  function startRename(source: Source) {
    setEditingId(source.id);
    setEditingTitle(source.title);
  }

  async function commitRename(sourceId: number) {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;

    await renameSource.mutateAsync({ id: sourceId, title });
    setMessage({ kind: 'success', text: t('sources.nameUpdated') });
  }

  async function handleDelete(source: Source) {
    try {
      await deleteSource.mutateAsync(source.id);
      setDeletedSourceIds((previous) => new Set(previous).add(source.id));
      setMessage({ kind: 'success', text: t('sources.deleted', { title: source.title }) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t('sources.delete');
      setMessage({ kind: 'error', text: detail });
    }
  }

  async function handleRefresh(sourceId: number) {
    try {
      await refreshSource.mutateAsync(sourceId);
      setMessage({ kind: 'success', text: t('sources.refreshTriggered') });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t('sources.refreshFailed');
      setMessage({ kind: 'error', text: detail });
    }
  }

  async function handleImport() {
    if (!selectedFile) return;

    const raw = await selectedFile.text();
    const response = await apiFetch<{ job_id: string }>('/api/sources/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/x-opml; charset=utf-8' },
      body: raw,
    });

    setImportJobId(response.job_id);
    setMessage({ kind: 'loading', text: t('sources.importingMessage') });
  }

  async function handleExport() {
    const response = await fetch('/api/sources/export', { credentials: 'include' });
    if (!response.ok) {
      setMessage({ kind: 'error', text: t('sources.exportFailed') });
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'xreader-sources.opml';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'success', text: t('sources.exportDone') });
  }

  const importProgress = importJob.data?.progress ?? null;
  const importBusy = Boolean(importJobId) || importJob.isFetching;
  const importStatusLabel =
    importJob.data?.status === 'done'
      ? t('sources.importDone')
      : importJob.data?.status === 'failed'
        ? t('sources.importFailed')
        : importBusy
          ? t('sources.importing')
          : t('sources.chooseFile');
  const fileInputId = 'sources-opml-file-input';

  return (
    <main className="h-full overflow-y-auto bg-[var(--bg-body)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Link href="/" className="font-[system-ui] text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]">
              ← {t('sources.backHome')}
            </Link>
            <header className="space-y-3">
              <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--text-body)]">{t('sources.title')}</h1>
              <p className="max-w-2xl font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">
                {t('sources.description')}
              </p>
            </header>
          </div>
          <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-right font-[system-ui] text-xs text-[var(--text-muted)] shadow-sm shadow-[var(--border-default)]/30">
            <div>{isFetching ? t('sources.syncing') : t('sources.synced')}</div>
            <div className="mt-1 text-[var(--text-body)]">{t('sources.count', { count: visibleSources.length })}</div>
          </div>
        </div>

        <section id="add-source" className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-input)]/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--text-body)]">{t('sources.addTitle')}</h2>
              <p className="font-[system-ui] text-sm text-[var(--text-muted)]">
                {t('sources.addDescription')}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={sourceUrl}
              onChange={(event) => {
                setSourceUrl(event.target.value);
                if (addSourceStatus.kind !== 'idle') {
                  setAddSourceStatus({ kind: 'idle', title: '' });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreateSource();
                }
              }}
              placeholder={t('sources.addPlaceholder')}
              className="ui-input min-w-0 flex-1 font-[system-ui] text-sm"
            />
            <button
              type="button"
              onClick={() => void handleCreateSource()}
              disabled={createSource.isPending}
              className="ui-btn-primary rounded-2xl px-5 py-3 font-[system-ui] text-sm"
            >
              {createSource.isPending ? t('sources.finding') : t('sources.findAndAdd')}
            </button>
          </div>
          <AddSourceProgress status={addSourceStatus} t={t} />
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-input)]/80 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="border-b border-[var(--border-strong)] px-5 py-4">
            <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--text-body)]">{t('sources.listTitle')}</h2>
          </div>

          {isLoading ? (
            <div className="px-5 py-10 font-[system-ui] text-sm text-[var(--text-muted)]">{t('sources.loading')}</div>
          ) : visibleSources.length === 0 ? (
            <div className="px-5 py-10 font-[system-ui]">
              <div className="max-w-xl">
                <div className="font-serif text-lg font-semibold tracking-tight text-[var(--text-body)]">
                  {t('sources.emptyTitle')}
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {t('sources.emptyDescription')}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href="#add-source" className="ui-btn-primary rounded-xl px-3 py-2 text-xs">
                    <PlusCircle size={14} strokeWidth={1.9} />
                    {t('sources.addTitle')}
                  </a>
                  <a href="#opml" className="ui-btn-secondary rounded-xl px-3 py-2 text-xs">
                    <Upload size={14} strokeWidth={1.9} />
                    {t('sources.importOpmlAction')}
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-strong)]">
              {visibleSources.map((source) => {
                const health = healthState(source);
                return (
                  <li key={source.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="mt-2 shrink-0">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${health.dotClass}`} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {editingId === source.id ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onBlur={() => void commitRename(source.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                void commitRename(source.id);
                              }
                              if (event.key === 'Escape') {
                                setEditingId(null);
                              }
                            }}
                            className="ui-input min-h-9 rounded-xl px-3 py-2 font-[system-ui] text-sm"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRename(source)}
                            className="min-w-0 truncate text-left font-serif text-base font-semibold tracking-tight text-[var(--text-body)] transition-colors hover:text-[var(--text-accent)]"
                            title={t('sources.renameTitle')}
                          >
                            {source.title}
                          </button>
                        )}
                        <span className="ui-pill-neutral border-[var(--border-strong)] px-2.5 py-1 font-[system-ui] text-[11px]">
                          {health.label === 'healthy'
                            ? t('sources.healthHealthy')
                            : health.label === 'degraded'
                              ? t('sources.healthDegraded')
                              : t('sources.healthError')}
                        </span>
                      </div>

                      <div className="space-y-1 font-[system-ui] text-xs text-[var(--text-muted)]">
                        <div className="truncate" title={source.url}>
                          {truncateUrl(source.url)}
                        </div>
                        <div>{t('sources.lastFetched', { time: timeAgo(source.last_fetched_at, t) })}</div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleRefresh(source.id)}
                        disabled={refreshSource.isPending}
                        className="ui-btn-secondary rounded-xl px-3 py-1.5 font-[system-ui] text-xs"
                      >
                        {t('sources.refresh')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(source)}
                        disabled={deleteSource.isPending}
                        className="ui-btn-secondary rounded-xl px-3 py-1.5 font-[system-ui] text-xs"
                      >
                        {t('sources.delete')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="opml" className="mt-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-input)]/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--text-body)]">{t('sources.opmlTitle')}</h2>
              <p className="mt-1 font-[system-ui] text-sm text-[var(--text-muted)]">{t('sources.opmlDescription')}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id={fileInputId}
                type="file"
                accept=".opml,.xml,application/xml,text/xml"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
                className="sr-only"
              />
              <label htmlFor={fileInputId} className="ui-btn-secondary cursor-pointer rounded-2xl px-4 py-3 font-[system-ui] text-sm">
                {t('sources.chooseFile')}
              </label>
              <span className="max-w-[240px] truncate font-[system-ui] text-xs text-[var(--text-muted)]">
                {selectedFile ? selectedFile.name : t('sources.chooseFile')}
              </span>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!selectedFile || importBusy}
                className={`${selectedFile ? 'ui-btn-primary' : 'ui-btn-secondary'} rounded-2xl px-4 py-3 font-[system-ui] text-sm`}
              >
                {t('sources.uploadImport')}
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="ui-btn-secondary rounded-2xl px-4 py-3 font-[system-ui] text-sm"
              >
                {t('sources.exportOpml')}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-body)] px-4 py-3 font-[system-ui] text-sm text-[var(--text-muted)]">
            <div className="flex items-center justify-between gap-3">
              <span>{importStatusLabel}</span>
              {importJob.data?.status ? <span className="text-xs uppercase tracking-wide">{importJob.data.status}</span> : null}
            </div>
            {message.kind === 'loading' ? (
              <p className="mt-2 font-[system-ui] text-xs text-[var(--text-muted)]">{message.text}</p>
            ) : null}
            {importBusy ? <ProgressBar progress={importProgress} t={t} /> : null}
          </div>
        </section>

        {message.kind !== 'idle' && message.kind !== 'loading' ? (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 font-[system-ui] text-sm ${
              message.kind === 'success'
                ? 'border-[var(--border-success)] bg-[var(--bg-badge-today)] text-[var(--text-success)]'
                : 'border-[var(--border-error)] bg-[var(--bg-highlight-error)] text-[var(--text-error)]'
            }`}
          >
            {message.text}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default SourcesPage;
