import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onBroadcast } from '@/lib/broadcast';

export function useBroadcastSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return onBroadcast((msg) => {
      if (msg.type === 'article-state' || msg.type === 'invalidate') {
        queryClient.invalidateQueries({ queryKey: ['articles'] });
      }
    });
  }, [queryClient]);
}
