'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

const NOTICE_DURATION_MS = 1800;

export function OperationSideNotice() {
  const { t } = useI18n();
  const notice = useUIStore((state) => state.operationSideNotice);
  const clearNotice = useUIStore((state) => state.clearOperationSideNotice);

  useEffect(() => {
    if (!notice) return;

    const timeout = globalThis.setTimeout(clearNotice, NOTICE_DURATION_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [clearNotice, notice]);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] left-1/2 z-[150] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-2 text-center text-[13px] font-medium text-[var(--text-1)] shadow-[0_14px_40px_rgba(47,39,26,0.18)] transition-opacity motion-reduce:transition-none"
    >
      {t('operationSide.changed', { side: t(`operationSide.${notice}`) })}
    </div>
  );
}
