'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  useCreateSource,
  useDeleteSource,
  useRenameSource,
  useSources,
} from '@/lib/queries/sources';
import type { Source } from '@/lib/types';

type ToastState = {
  source: Source;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ImportState = {
  text: string;
  kind: 'idle' | 'loading' | 'success' | 'error';
};

function timeAgo(iso: string | null): string {
  if (!iso) return '从未';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function HealthDot({ failCount }: { failCount: number }) {
  const color =
    failCount === 0 ? 'bg-green-500' : failCount > 3 ? 'bg-red-500' : 'bg-yellow-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />;
}

async function fetchImportStatus(jobId: string) {
  return apiFetch<{
    status: string;
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }>(`/api/sources/jobs/${jobId}`);
}

export function SourcesPage() {
  const { data: sources, isLoading } = useSources();
  const createSource = useCreateSource();
  const renameSource = useRenameSource();
  const deleteSource = useDeleteSource();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    text: '',
    kind: 'idle',
  });
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const visibleSources = useMemo(
    () => sources?.filter((source) => toast?.source.id !== source.id) ?? [],
    [sources, toast],
  );

  useEffect(() => {
    return () => {
      if (toast) {
        clearTimeout(toast.timeoutId);
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [toast]);

  useEffect(() => {
    if (!importJobId) return;

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchImportStatus(importJobId);
        if (status.status === 'done') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setImportJobId(null);
          setImportState({
            kind: 'success',
            text: `导入完成：${status.succeeded} 成功，${status.failed} 失败，${status.skipped} 跳过`,
          });
        }
      } catch {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setImportJobId(null);
        setImportState({ kind: 'error', text: '导入失败' });
      }
    }, 1000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [importJobId]);

  async function handleAddSource() {
    const url = newUrl.trim();
    if (!url) return;

    await createSource.mutateAsync(url);
    setNewUrl('');
    setShowAddForm(false);
  }

  function beginRename(source: Source) {
    setEditingId(source.id);
    setEditingTitle(source.title);
  }

  async function commitRename(sourceId: number) {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }

    await renameSource.mutateAsync({ id: sourceId, title });
    setEditingId(null);
  }

  function handleDelete(source: Source) {
    if (toast) {
      clearTimeout(toast.timeoutId);
      setToast(null);
    }

    const timeoutId = setTimeout(() => {
      deleteSource.mutate(source.id);
      setToast(null);
    }, 5000);

    setToast({ source, timeoutId });
  }

  function handleUndoDelete() {
    if (!toast) return;
    clearTimeout(toast.timeoutId);
    setToast(null);
  }

  async function handleImportUpload() {
    if (!selectedImportFile) return;

    setImportState({ kind: 'loading', text: '导入中…' });
    const text = await selectedImportFile.text();
    const { job_id } = await apiFetch<{ job_id: string }>('/api/sources/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/x-opml' },
      body: text,
    });
    setImportJobId(job_id);
  }

  async function handleExport() {
    const response = await fetch('/api/sources/export', { credentials: 'include' });
    if (!response.ok) {
      setImportState({ kind: 'error', text: '导出失败' });
      return;
    }

    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'xreader-sources.opml';
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#1f1f1f]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-[#8a8275] hover:text-[#1f1f1f]">
            ← 返回
          </Link>
          <h1 className="text-2xl font-semibold">订阅源管理</h1>
          <span aria-hidden="true" className="w-10" />
        </div>

        <section className="rounded-2xl border border-[#ece6d8] bg-white/70 p-4 shadow-sm shadow-[#ece6d8]/30">
          {showAddForm ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                autoFocus
                type="url"
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleAddSource();
                  }
                }}
                placeholder="https://example.com/feed.xml"
                className="min-w-0 flex-1 rounded-xl border border-[#ece6d8] bg-[#fbfaf7] px-3 py-2 text-sm outline-none transition focus:border-[#1f1f1f]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleAddSource()}
                  disabled={createSource.isPending}
                  className="rounded-xl bg-[#1f1f1f] px-4 py-2 text-sm text-white transition hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-xl border border-[#ece6d8] px-4 py-2 text-sm text-[#8a8275] transition hover:bg-[#f5f0e6]"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-xl bg-[#1f1f1f] px-4 py-2 text-sm text-white transition hover:bg-[#333]"
            >
              添加订阅源
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-[#ece6d8] bg-white/70 shadow-sm shadow-[#ece6d8]/30">
          <div className="border-b border-[#ece6d8] px-4 py-3 text-sm font-medium text-[#8a8275]">
            订阅源列表
          </div>
          {isLoading ? (
            <div className="px-4 py-6 text-sm text-[#8a8275]">加载中…</div>
          ) : visibleSources.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#8a8275]">还没有订阅任何源</div>
          ) : (
            <ul className="divide-y divide-[#ece6d8]">
              {visibleSources.map((source) => (
                <li key={source.id} className="flex items-start gap-3 px-4 py-4">
                  <div className="mt-2 shrink-0">
                    <HealthDot failCount={source.fail_count} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
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
                          className="min-w-0 flex-1 rounded-lg border border-[#ece6d8] bg-[#fbfaf7] px-2 py-1 text-sm outline-none focus:border-[#1f1f1f]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginRename(source)}
                          className="min-w-0 truncate text-left text-sm font-medium hover:text-[#8a8275]"
                          title="点击重命名"
                        >
                          {source.title}
                        </button>
                      )}
                      <span className="shrink-0 text-xs text-[#8a8275]">
                        {source.fail_count === 0 ? '状态良好' : `失败 ${source.fail_count} 次`}
                      </span>
                    </div>
                    <div className="mt-1 space-y-1 text-xs text-[#8a8275]">
                      <div className="truncate">{source.feed_url}</div>
                      {source.site_url ? <div className="truncate">{source.site_url}</div> : null}
                      <div>上次抓取：{timeAgo(source.last_fetched_at)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(source)}
                    className="shrink-0 rounded-lg border border-[#ece6d8] px-3 py-1.5 text-xs text-[#8a8275] transition hover:bg-[#f5f0e6] hover:text-[#1f1f1f]"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[#ece6d8] bg-white/70 p-4 shadow-sm shadow-[#ece6d8]/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <input
                type="file"
                accept=".opml,.xml"
                onChange={(event) => setSelectedImportFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#8a8275] file:mr-4 file:rounded-xl file:border-0 file:bg-[#1f1f1f] file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-[#333]"
              />
              <button
                type="button"
                onClick={() => void handleImportUpload()}
                disabled={!selectedImportFile || importState.kind === 'loading'}
                className="shrink-0 rounded-xl border border-[#ece6d8] px-4 py-2 text-sm text-[#8a8275] transition hover:bg-[#f5f0e6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上传导入
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-xl border border-[#ece6d8] px-4 py-2 text-sm text-[#8a8275] transition hover:bg-[#f5f0e6]"
            >
              导出 OPML
            </button>
          </div>
          {importState.kind !== 'idle' ? (
            <p className="mt-3 text-sm text-[#8a8275]">{importState.text}</p>
          ) : null}
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#1f1f1f] px-4 py-3 text-sm text-white shadow-lg shadow-black/20">
          <span>已删除「{toast.source.title}」</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-[#f3dd9b] transition hover:bg-white/10"
          >
            撤销
          </button>
        </div>
      ) : null}
    </main>
  );
}

export default SourcesPage;
