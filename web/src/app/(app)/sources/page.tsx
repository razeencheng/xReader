'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  useCreateSource,
  useDeleteSource,
  useRefreshSource,
  useRenameSource,
  useSourceImportJob,
  useSources,
} from '@/lib/queries/sources';
import type { Source } from '@/lib/types';

type PendingDelete = {
  source: Source;
  timeoutId: number;
};

type MessageState = {
  kind: 'idle' | 'loading' | 'success' | 'error';
  text: string;
};

function timeAgo(iso: string | null): string {
  if (!iso) return '从未';

  const diffMinutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  return `${Math.floor(diffHours / 24)} 天前`;
}

function truncateUrl(url: string, maxLength = 48) {
  if (url.length <= maxLength) return url;
  const visible = Math.max(8, maxLength - 1);
  return `${url.slice(0, visible)}…`;
}

function healthState(source: Source) {
  if (source.fail_count <= 0) {
    return { label: 'healthy', dotClass: 'bg-emerald-500' };
  }

  if (source.fail_count < 4) {
    return { label: 'degraded', dotClass: 'bg-amber-500' };
  }

  return { label: 'error', dotClass: 'bg-rose-500' };
}

function ProgressBar({ progress }: { progress: number | null }) {
  const percent = progress == null ? null : Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress));

  return (
    <div className="mt-3 space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-[#f2eadc]">
        <div
          className="h-full rounded-full bg-[#d4a24c] transition-all"
          style={{ width: `${percent ?? 18}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="font-[system-ui] text-xs text-[#8a8275]">
        {percent == null ? '正在导入…' : `导入进度 ${Math.round(percent)}%`}
      </p>
    </div>
  );
}

export function SourcesPage() {
  const { data: sources, isLoading, isFetching } = useSources();
  const createSource = useCreateSource();
  const renameSource = useRenameSource();
  const deleteSource = useDeleteSource();
  const refreshSource = useRefreshSource();

  const [sourceUrl, setSourceUrl] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [message, setMessage] = useState<MessageState>({ kind: 'idle', text: '' });
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const importJob = useSourceImportJob(importJobId);

  const visibleSources = useMemo(() => {
    if (!sources) return [];
    if (!pendingDelete) return sources;
    return sources.filter((source) => source.id !== pendingDelete.source.id);
  }, [pendingDelete, sources]);

  useEffect(() => {
    return () => {
      if (pendingDelete) {
        window.clearTimeout(pendingDelete.timeoutId);
      }
    };
  }, [pendingDelete]);

  useEffect(() => {
    if (!importJobId || !importJob.data) return;

    if (importJob.data.status === 'done') {
      setImportJobId(null);
      setMessage({ kind: 'success', text: 'OPML 导入完成。' });
    }

    if (importJob.data.status === 'failed') {
      setImportJobId(null);
      setMessage({ kind: 'error', text: 'OPML 导入失败。' });
    }
  }, [importJob.data, importJobId]);

  async function handleCreateSource() {
    const url = sourceUrl.trim();
    if (!url) return;

    await createSource.mutateAsync(url);
    setSourceUrl('');
    setMessage({ kind: 'success', text: '订阅源已添加。' });
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
    setMessage({ kind: 'success', text: '订阅源名称已更新。' });
  }

  function queueDelete(source: Source) {
    if (pendingDelete) {
      window.clearTimeout(pendingDelete.timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      void deleteSource.mutateAsync(source.id);
      setPendingDelete(null);
    }, 5000);

    setPendingDelete({ source, timeoutId });
  }

  function undoDelete() {
    if (!pendingDelete) return;

    window.clearTimeout(pendingDelete.timeoutId);
    setPendingDelete(null);
    setMessage({ kind: 'idle', text: '' });
  }

  async function handleRefresh(sourceId: number) {
    await refreshSource.mutateAsync(sourceId);
    setMessage({ kind: 'success', text: '已触发重新抓取。' });
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
    setMessage({ kind: 'loading', text: '正在导入 OPML…' });
  }

  async function handleExport() {
    const response = await fetch('/api/sources/export', { credentials: 'include' });
    if (!response.ok) {
      setMessage({ kind: 'error', text: '导出 OPML 失败。' });
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'xreader-sources.opml';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'success', text: 'OPML 已导出。' });
  }

  const importProgress = importJob.data?.progress ?? null;
  const importBusy = Boolean(importJobId) || importJob.isFetching;
  const importStatusLabel =
    importJob.data?.status === 'done'
      ? '导入已完成'
      : importJob.data?.status === 'failed'
        ? '导入失败'
        : importBusy
          ? '导入中…'
          : '选择文件后上传';

  return (
    <main className="min-h-screen bg-[#fdfbf6] text-[#1f1f1f]">
      <div className="border-b border-[#e8e0d4] bg-[#fdfbf6]/95">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-[#1f1f1f]">
            xReader
          </Link>
          <nav className="flex items-center gap-4 font-[system-ui] text-sm text-[#8a8275]">
            <Link href="/sources" className="text-[#1f1f1f] transition-colors hover:text-[#d4a24c]">
              订阅源
            </Link>
            <Link href="/settings" className="transition-colors hover:text-[#1f1f1f]">
              设置
            </Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Link href="/" className="font-[system-ui] text-sm text-[#8a8275] transition-colors hover:text-[#1f1f1f]">
              ← 返回首页
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e0d4] bg-white px-3 py-1.5 font-[system-ui] text-xs text-[#8a8275]">
              <span aria-hidden="true">☰</span>
              <span>订阅源管理</span>
            </div>
            <header className="space-y-3">
              <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1f1f1f]">订阅源</h1>
              <p className="max-w-2xl font-[system-ui] text-sm leading-6 text-[#8a8275]">
                管理 RSS 订阅、导入导出 OPML、快速刷新抓取结果，保持阅读流始终新鲜。
              </p>
            </header>
          </div>
          <div className="rounded-2xl border border-[#e8e0d4] bg-white px-4 py-3 text-right font-[system-ui] text-xs text-[#8a8275] shadow-sm shadow-[#ece6d8]/30">
            <div>{isFetching ? '同步中…' : '已同步'}</div>
            <div className="mt-1 text-[#1f1f1f]">{visibleSources.length} 个订阅源</div>
          </div>
        </div>

        <section className="rounded-3xl border border-[#e8e0d4] bg-white/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-[#1f1f1f]">添加订阅源</h2>
              <p className="font-[system-ui] text-sm text-[#8a8275]">输入 RSS 或 Atom 地址后点击添加。</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreateSource();
                }
              }}
              placeholder="https://example.com/feed.xml"
              className="min-w-0 flex-1 rounded-2xl border border-[#e8e0d4] bg-[#fdfbf6] px-4 py-3 font-[system-ui] text-sm text-[#1f1f1f] outline-none transition focus:border-[#d4a24c] focus:ring-2 focus:ring-[#d4a24c]/20"
            />
            <button
              type="button"
              onClick={() => void handleCreateSource()}
              disabled={createSource.isPending}
              className="rounded-2xl bg-[#1f1f1f] px-5 py-3 font-[system-ui] text-sm text-white transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[#e8e0d4] bg-white/80 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="border-b border-[#e8e0d4] px-5 py-4">
            <h2 className="font-serif text-xl font-semibold tracking-tight text-[#1f1f1f]">订阅源列表</h2>
          </div>

          {isLoading ? (
            <div className="px-5 py-10 font-[system-ui] text-sm text-[#8a8275]">加载中…</div>
          ) : visibleSources.length === 0 ? (
            <div className="px-5 py-10 font-[system-ui] text-sm text-[#8a8275]">还没有添加任何订阅源。</div>
          ) : (
            <ul className="divide-y divide-[#e8e0d4]">
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
                            className="min-w-0 flex-1 rounded-xl border border-[#e8e0d4] bg-[#fdfbf6] px-3 py-2 font-[system-ui] text-sm text-[#1f1f1f] outline-none focus:border-[#d4a24c] focus:ring-2 focus:ring-[#d4a24c]/20"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRename(source)}
                            className="min-w-0 truncate text-left font-serif text-base font-semibold tracking-tight text-[#1f1f1f] transition-colors hover:text-[#d4a24c]"
                            title="点击重命名"
                          >
                            {source.title}
                          </button>
                        )}
                        <span className="rounded-full border border-[#e8e0d4] px-2.5 py-1 font-[system-ui] text-[11px] text-[#8a8275]">
                          {health.label === 'healthy' ? 'healthy' : health.label === 'degraded' ? 'degraded' : 'error'}
                        </span>
                      </div>

                      <div className="space-y-1 font-[system-ui] text-xs text-[#8a8275]">
                        <div className="truncate" title={source.feed_url}>
                          {truncateUrl(source.feed_url)}
                        </div>
                        <div>上次抓取：{timeAgo(source.last_fetched_at)}</div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleRefresh(source.id)}
                        disabled={refreshSource.isPending}
                        className="rounded-xl border border-[#e8e0d4] px-3 py-1.5 font-[system-ui] text-xs text-[#8a8275] transition-colors hover:bg-[#f5f0e6] hover:text-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        刷新
                      </button>
                      <button
                        type="button"
                        onClick={() => queueDelete(source)}
                        className="rounded-xl border border-[#e8e0d4] px-3 py-1.5 font-[system-ui] text-xs text-[#8a8275] transition-colors hover:bg-[#f5f0e6] hover:text-[#1f1f1f]"
                      >
                        删除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-[#e8e0d4] bg-white/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl font-semibold tracking-tight text-[#1f1f1f]">OPML 导入 / 导出</h2>
              <p className="mt-1 font-[system-ui] text-sm text-[#8a8275]">上传 OPML 后会自动轮询任务状态直到完成。</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="file"
                accept=".opml,.xml,application/xml,text/xml"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
                className="block w-full text-sm text-[#8a8275] file:mr-4 file:rounded-2xl file:border-0 file:bg-[#1f1f1f] file:px-4 file:py-2 file:font-[system-ui] file:text-sm file:text-white hover:file:bg-[#333]"
              />
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!selectedFile || importBusy}
                className="rounded-2xl border border-[#e8e0d4] px-4 py-3 font-[system-ui] text-sm text-[#8a8275] transition-colors hover:bg-[#f5f0e6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上传导入
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="rounded-2xl border border-[#e8e0d4] px-4 py-3 font-[system-ui] text-sm text-[#8a8275] transition-colors hover:bg-[#f5f0e6]"
              >
                导出 OPML
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#e8e0d4] bg-[#fdfbf6] px-4 py-3 font-[system-ui] text-sm text-[#8a8275]">
            <div className="flex items-center justify-between gap-3">
              <span>{importStatusLabel}</span>
              {importJob.data?.status ? <span className="text-xs uppercase tracking-wide">{importJob.data.status}</span> : null}
            </div>
            {message.kind === 'loading' ? (
              <p className="mt-2 font-[system-ui] text-xs text-[#8a8275]">{message.text}</p>
            ) : null}
            {importBusy ? <ProgressBar progress={importProgress} /> : null}
          </div>
        </section>

        {message.kind !== 'idle' && message.kind !== 'loading' ? (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 font-[system-ui] text-sm ${
              message.kind === 'success'
                ? 'border-[#d9e8cf] bg-[#f4fbef] text-[#4a6b31]'
                : 'border-[#f1d2d2] bg-[#fff3f3] text-[#9b3f3f]'
            }`}
          >
            {message.text}
          </div>
        ) : null}
      </div>

      {pendingDelete ? (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#1f1f1f] px-4 py-3 font-[system-ui] text-sm text-white shadow-lg shadow-black/20">
          <span>已删除 {pendingDelete.source.title}</span>
          <button
            type="button"
            onClick={undoDelete}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-[#f3dd9b] transition-colors hover:bg-white/10"
          >
            撤销
          </button>
        </div>
      ) : null}
    </main>
  );
}

export default SourcesPage;
