import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Source } from '@/lib/types';

export interface SourceImportJobStatus {
  status: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
}

export function useSources() {
  return useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: () => apiFetch<Source[]>('/api/sources'),
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiFetch<Source>('/api/sources', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useRenameSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      apiFetch<void>(`/api/sources/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useRefreshSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/sources/${id}/refresh`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useSourceImportJob(jobId: string | null) {
  return useQuery<SourceImportJobStatus>({
    queryKey: ['sources', 'jobs', jobId],
    queryFn: () => apiFetch<SourceImportJobStatus>(`/api/sources/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: 1000,
  });
}
