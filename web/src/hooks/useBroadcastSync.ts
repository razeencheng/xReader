'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribe } from '@/lib/broadcast';
import { useReadStateCoordinator } from '@/components/providers/ReadStateProvider';
import { applyArticleStateChange } from '@/lib/article-state-cache';

export function useBroadcastSync() {
  const coordinator = useReadStateCoordinator();
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.is_read === undefined) {
        applyArticleStateChange(queryClient, msg);
        return;
      }
      coordinator.applyRemote({
        article_id: msg.articleId,
        is_read: Boolean(msg.is_read),
        is_starred: Boolean(msg.is_starred),
        state_version: msg.state_version,
      });
    });
  }, [coordinator, queryClient]);
}
