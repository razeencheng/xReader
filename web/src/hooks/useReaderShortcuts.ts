'use client';

import { useCallback, useMemo, useState } from 'react';
import { useShortcuts } from '@/hooks/useShortcuts';

interface ReaderShortcutHandlers {
  onNext?: () => void;
  onPrev?: () => void;
  onToggleStar?: () => void;
  onMarkRead?: () => void;
  onToggleFocus?: () => void;
  onEscape?: () => void;
}

export function useReaderShortcuts({
  onNext,
  onPrev,
  onToggleStar,
  onMarkRead,
  onToggleFocus,
  onEscape,
}: ReaderShortcutHandlers) {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const openShortcuts = useCallback(() => {
    setIsShortcutsOpen(true);
  }, []);

  const closeShortcuts = useCallback(() => {
    setIsShortcutsOpen(false);
  }, []);

  const shortcuts = useMemo<Record<string, () => void>>(() => {
    const nextShortcuts: Record<string, () => void> = {
      escape: isShortcutsOpen ? closeShortcuts : () => onEscape?.(),
    };

    if (isShortcutsOpen) {
      return nextShortcuts;
    }

    nextShortcuts.j = () => onNext?.();
    nextShortcuts.k = () => onPrev?.();
    nextShortcuts.arrowright = () => onNext?.();
    nextShortcuts.arrowleft = () => onPrev?.();
    nextShortcuts.s = () => onToggleStar?.();
    nextShortcuts.r = () => onMarkRead?.();
    nextShortcuts.f = () => onToggleFocus?.();
    nextShortcuts['?'] = openShortcuts;

    return nextShortcuts;
  }, [closeShortcuts, isShortcutsOpen, onEscape, onMarkRead, onNext, onPrev, onToggleFocus, onToggleStar, openShortcuts]);

  useShortcuts(shortcuts);

  return {
    isShortcutsOpen,
    openShortcuts,
    closeShortcuts,
  };
}
