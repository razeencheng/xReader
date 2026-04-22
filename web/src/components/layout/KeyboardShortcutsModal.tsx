'use client';

import { Keyboard, X } from 'lucide-react';

const SHORTCUT_GROUPS = [
  {
    label: 'Navigation',
    items: [
      ['j', 'Next article'],
      ['k', 'Previous article'],
    ],
  },
  {
    label: 'Article',
    items: [
      ['s', 'Star / unstar current article'],
      ['r', 'Mark current article as read'],
    ],
  },
  {
    label: 'View',
    items: [
      ['f', 'Toggle focus mode'],
      ['?', 'Show keyboard shortcuts'],
      ['Esc', 'Close'],
    ],
  },
] as const;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-8 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-[3px] text-[11px] font-semibold text-[var(--text-2)] shadow-[inset_0_-1px_0_rgba(65,52,35,0.05)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsButton({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Keyboard shortcuts (?)"
      aria-label="Open keyboard shortcuts"
      className={`fixed bottom-4 left-4 z-[90] inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[rgba(248,244,238,0.92)] px-3 py-2 text-[11px] text-[var(--text-3)] shadow-[0_16px_40px_rgba(65,52,35,0.12)] backdrop-blur transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-2)] ${className}`}
    >
      <Keyboard size={13} />
      <span className="font-medium">快捷键</span>
      <Kbd>?</Kbd>
    </button>
  );
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        className="w-full max-w-[380px] rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)]">Keyboard Shortcuts</h2>
            <p className="mt-1 text-[12px] text-[var(--text-3)]">Keep reading without leaving the keyboard.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="rounded-[9px] p-2 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.label}>
              <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">
                {group.label}
              </div>
              <div className="overflow-hidden rounded-[12px] border border-[var(--border-light)]">
                {group.items.map(([key, label], index) => (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-4 bg-[rgba(255,255,255,0.6)] px-3 py-2.5 ${
                      index > 0 ? 'border-t border-[var(--border-light)]' : ''
                    }`}
                  >
                    <span className="text-[13px] text-[var(--text-2)]">{label}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
