'use client';

import { LANGUAGE_OPTIONS } from '@/components/layout/navigationConfig';

export function LanguageModal({
  currentLanguage,
  onSelect,
  onClose,
}: {
  currentLanguage: string;
  onSelect: (language: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[14.5px] font-semibold text-[var(--text)]">Native Language</h2>
        <p className="mt-2 text-[12.5px] leading-5 text-[var(--text-3)]">
          Titles translate automatically. Paragraph translation stays on demand.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {LANGUAGE_OPTIONS.map((language) => {
            const active = currentLanguage === language.code;

            return (
              <button
                key={language.code}
                type="button"
                onClick={() => {
                  onSelect(language.code);
                  onClose();
                }}
                className={`flex items-center justify-between rounded-[9px] border px-3 py-[9px] text-[13px] transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span>
                  {language.label}{' '}
                  <span className="font-normal text-[var(--text-3)]">· {language.name}</span>
                </span>
                {active ? <span className="text-[12px]">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
