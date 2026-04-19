import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ArticleListResponse } from '@/lib/types';

export function useArticles(tab: string) {
  return useInfiniteQuery({
    queryKey: ['articles', tab],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab });
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<ArticleListResponse>(`/api/articles?${params}`);
    },
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}
