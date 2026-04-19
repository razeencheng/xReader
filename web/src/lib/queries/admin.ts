import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface AllowlistEntry {
  github_username: string;
  role: string;
  created_at: string;
}

export function useAllowlist() {
  return useQuery<AllowlistEntry[]>({
    queryKey: ['admin', 'allowlist'],
    queryFn: () => apiFetch<AllowlistEntry[]>('/api/admin/allowlist'),
  });
}

export function useAddAllowlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch('/api/admin/allowlist', {
        method: 'POST',
        body: JSON.stringify({ github_username: username }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'allowlist'] }),
  });
}

export function useRemoveAllowlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch(`/api/admin/allowlist/${username}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'allowlist'] }),
  });
}
