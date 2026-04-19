'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  useAddAllowlistEntry,
  useAllowlist,
  useRemoveAllowlistEntry,
} from '@/lib/queries/admin';

function formatCreatedAt(createdAt: string) {
  return new Date(createdAt).toLocaleDateString();
}

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { data: entries, isLoading } = useAllowlist();
  const addEntry = useAddAllowlistEntry();
  const removeEntry = useRemoveAllowlistEntry();
  const [newUsername, setNewUsername] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/');
    }
  }, [router, user]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  const handleAdd = async () => {
    const name = newUsername.trim();
    if (!name) {
      return;
    }

    await addEntry.mutateAsync(name);
    setNewUsername('');
  };

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#1f1f1f]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="text-sm text-[#8a8275] hover:text-[#1f1f1f]">
          ← 返回
        </Link>
        <h1 className="mt-4 mb-6 text-2xl font-semibold">用户白名单管理</h1>

        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="GitHub 用户名"
            className="flex-1 rounded-lg border border-[#ece6d8] bg-white px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleAdd();
              }
            }}
          />
          <button
            onClick={() => void handleAdd()}
            disabled={addEntry.isPending}
            className="rounded-lg bg-[#1f1f1f] px-4 py-2 text-sm text-white hover:bg-[#333] disabled:opacity-50"
          >
            添加
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-[#8a8275]">加载中…</p>
        ) : !entries?.length ? (
          <p className="text-sm text-[#8a8275]">白名单为空</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#ece6d8] text-left text-[#8a8275]">
                <th className="pb-2 font-medium">用户名</th>
                <th className="pb-2 font-medium">角色</th>
                <th className="pb-2 font-medium">添加时间</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ece6d8]">
              {entries.map((entry) => (
                <tr key={entry.github_username}>
                  <td className="py-2 font-medium">{entry.github_username}</td>
                  <td className="py-2 text-[#8a8275]">{entry.role}</td>
                  <td className="py-2 text-[#8a8275]">{formatCreatedAt(entry.created_at)}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => void removeEntry.mutateAsync(entry.github_username)}
                      className="text-xs text-red-400 hover:text-red-600"
                      disabled={removeEntry.isPending}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
