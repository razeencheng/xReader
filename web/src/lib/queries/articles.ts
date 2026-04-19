import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ArticleListResponse, ArticleTab } from '@/lib/types';

type ArticlesQueryKey = ['articles', ArticleTab];

type ArticlesQueryOptions = Omit<
  UseInfiniteQueryOptions<
    ArticleListResponse,
    Error,
    InfiniteData<ArticleListResponse>,
    ArticlesQueryKey,
    string | undefined
  >,
  'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'
>;

export function useArticles(tab: ArticleTab, options?: ArticlesQueryOptions) {
  return useInfiniteQuery({
    queryKey: ['articles', tab],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab });
      if (pageParam) {
        params.set('cursor', pageParam);
      }
      return apiFetch<ArticleListResponse>(`/api/articles?${params.toString()}`);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    ...options,
  });
}
