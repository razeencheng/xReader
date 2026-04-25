'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Globe, Keyboard, List, RadioTower, Settings, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore, type ViewTab } from '@/stores/useUIStore';
import { KeyboardShortcutsModal } from '@/components/layout/KeyboardShortcutsModal';

const LANGUAGE_OPTIONS = [
  { code: 'zh-CN', label: '中文', name: 'Chinese', short: 'ZH' },
  { code: 'en', label: 'EN', name: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', name: 'Japanese', short: 'JA' },
  { code: 'es', label: 'ES', name: 'Spanish', short: 'ES' },
  { code: 'fr', label: 'FR', name: 'French', short: 'FR' },
  { code: 'de', label: 'DE', name: 'German', short: 'DE' },
  { code: 'ko', label: '한국어', name: 'Korean', short: 'KO' },
  { code: 'pt', label: 'PT', name: 'Portuguese', short: 'PT' },
] as const;

function LanguageModal({
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

export function Sidebar({ className = '' }: { className?: string }) {
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const router = useRouter();
  const currentView = useUIStore((state) => state.currentView);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const nativeLanguage = useUIStore((state) => state.nativeLanguage);
  const setNativeLanguage = useUIStore((state) => state.setNativeLanguage);

  const currentLanguage = useMemo(
    () => LANGUAGE_OPTIONS.find((option) => option.code === nativeLanguage) ?? LANGUAGE_OPTIONS[0],
    [nativeLanguage],
  );

  const navItems: { id: ViewTab; icon: typeof CalendarDays; title: string }[] = [
    { id: 'today', icon: CalendarDays, title: 'Today' },
    { id: 'all', icon: List, title: 'All Articles' },
    { id: 'starred', icon: Star, title: 'Starred' },
    { id: 'sources', icon: RadioTower, title: 'Sources' },
  ];

  return (
    <>
      <aside className={`flex h-full w-[52px] flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg-panel)] px-0 py-[10px] ${className}`}>
        <div className="mb-[14px] select-none font-serif text-[15px] font-semibold italic tracking-[-0.08em] text-[var(--accent)]">
          x
        </div>

        <nav className="flex w-full flex-1 flex-col items-center gap-1">
          {navItems.map((item) => {
            const active = currentView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                title={item.title}
                onClick={() => setCurrentView(item.id)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-[9px] transition-colors ${
                  active
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]'
                }`}
              >
                {active ? <motion.span layoutId="sidebar-active-bg" className="absolute inset-0 rounded-[9px] bg-[var(--accent-bg)]" /> : null}
                <item.icon size={17} strokeWidth={1.75} className="relative z-10" />
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          title="快捷键"
          onClick={() => setIsShortcutsOpen(true)}
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
        >
          <Keyboard size={16} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          title={`Native language: ${currentLanguage.name}`}
          onClick={() => setIsLanguageOpen(true)}
          className="flex h-9 w-9 flex-col items-center justify-center gap-[1px] rounded-[9px] text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
        >
          <Globe size={15} strokeWidth={1.75} />
          <span className="text-[8px] font-semibold leading-none tracking-[0.03em] text-[var(--accent)]">
            {currentLanguage.short}
          </span>
        </button>

        <button
          type="button"
          title="Settings"
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
        >
          <Settings size={17} strokeWidth={1.75} />
        </button>
      </aside>

      {isLanguageOpen ? (
        <LanguageModal
          currentLanguage={nativeLanguage}
          onSelect={setNativeLanguage}
          onClose={() => setIsLanguageOpen(false)}
        />
      ) : null}
      <KeyboardShortcutsModal open={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </>
  );
}
