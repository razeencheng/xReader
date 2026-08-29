'use client';

import type { CSSProperties } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTouchCapability } from '@/hooks/useTouchCapability';
import type { AdvanceMode, AdvancePhase } from '@/lib/reader-advance';

interface Props {
  mode: AdvanceMode;
  phase: AdvancePhase;
  hidden: boolean;
  onAdvance: () => void;
}

export function ReaderAdvanceButton({ mode, phase, hidden, onAdvance }: Props) {
  const { t } = useI18n();
  const touchCapable = useTouchCapability();
  if (!touchCapable || hidden || mode === 'none') return null;

  const busy = phase !== 'idle' && phase !== 'observed';
  const completing = mode === 'complete-current';
  const label = busy ? t('reader.advanceLoading') : completing ? t('reader.completeCurrent') : t('reader.advanceNext');
  const ariaLabel = completing ? t('reader.completeCurrentAria') : t('reader.advanceNextAria');

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onAdvance}
      className="operation-edge-anchor fixed z-[55] inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 text-[13px] font-semibold text-[var(--text-2)] shadow-[0_10px_30px_rgba(30,24,16,0.16)] transition-opacity motion-reduce:transition-none disabled:cursor-wait disabled:opacity-65"
      style={{
        '--operation-edge-offset': '1rem',
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
      } as CSSProperties}
    >
      {label}
    </button>
  );
}
