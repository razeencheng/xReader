'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Palette, Settings } from 'lucide-react';
import { useUIStore, type AccentColor, type Density, type Layout } from '@/stores/useUIStore';
import { applyReaderLayoutSelection, getActiveReaderLayout } from '@/lib/reader-layout';

const CHIP_BASE =
  'rounded-md border px-[11px] py-1 text-[12px] transition-colors';

const FONT_SIZES = [14, 16, 17, 19, 21] as const;
const ACCENTS: Array<{ id: AccentColor; color: string }> = [
  { id: 'blue', color: 'oklch(50% 0.16 255)' },
  { id: 'sage', color: 'oklch(52% 0.12 160)' },
  { id: 'ember', color: 'oklch(52% 0.15 32)' },
  { id: 'rose', color: 'oklch(52% 0.16 5)' },
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-[14px] last:mb-0">
      <div className="mb-[7px] text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--text-3)]">
        {label}
      </div>
      {children}
    </section>
  );
}

function Chip<T extends string | number>({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: T;
  active: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`${CHIP_BASE} ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-bg)] font-medium text-[var(--accent)]'
          : 'border-[var(--border)] bg-transparent text-[var(--text-2)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {label}
    </button>
  );
}

export function TweaksPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const accentColor = useUIStore((state) => state.accentColor);
  const setAccentColor = useUIStore((state) => state.setAccentColor);
  const fontSize = useUIStore((state) => state.fontSize);
  const setFontSize = useUIStore((state) => state.setFontSize);
  const density = useUIStore((state) => state.density);
  const setDensity = useUIStore((state) => state.setDensity);
  const layout = useUIStore((state) => state.layout);
  const setLayout = useUIStore((state) => state.setLayout);
  const focusMode = useUIStore((state) => state.focusMode);
  const setFocusMode = useUIStore((state) => state.setFocusMode);

  const activeLayout = getActiveReaderLayout(layout, focusMode);

  const handleSelectLayout = (value: Layout) => {
    applyReaderLayoutSelection(value, setLayout, setFocusMode);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="min-w-[240px] rounded-[14px] border border-[var(--border)] bg-[var(--bg)] px-5 py-[18px] shadow-[0_8px_32px_rgba(0,0,0,0.14)]"
          >
            <div className="mb-4 text-[13.5px] font-semibold text-[var(--text)]">Tweaks</div>

            <Section label="Layout">
              <div className="flex flex-wrap gap-[6px]">
                <Chip label="Classic" value="classic" active={activeLayout === 'classic'} onSelect={handleSelectLayout} />
                <Chip label="Focus" value="focus" active={activeLayout === 'focus'} onSelect={handleSelectLayout} />
                <Chip label="Wide" value="wide" active={activeLayout === 'wide'} onSelect={handleSelectLayout} />
              </div>
            </Section>

            <Section label="Density">
              <div className="flex flex-wrap gap-[6px]">
                {(['comfortable', 'compact'] as const).map((value) => (
                  <Chip
                    key={value}
                    label={value === 'comfortable' ? 'Comfortable' : 'Compact'}
                    value={value satisfies Density}
                    active={density === value}
                    onSelect={setDensity}
                  />
                ))}
              </div>
            </Section>

            <Section label="Font Size">
              <div className="flex flex-wrap gap-[6px]">
                {FONT_SIZES.map((value) => (
                  <Chip key={value} label={`${value}`} value={value} active={fontSize === value} onSelect={setFontSize} />
                ))}
              </div>
            </Section>

            <Section label="Accent">
              <div className="flex items-center gap-[9px]">
                {ACCENTS.map((accent) => {
                  const active = accent.id === accentColor;

                  return (
                    <button
                      key={accent.id}
                      type="button"
                      aria-label={`Accent ${accent.id}`}
                      onClick={() => setAccentColor(accent.id)}
                      className="h-[22px] w-[22px] rounded-full border-none transition-transform hover:scale-105"
                      style={{
                        background: accent.color,
                        outline: active ? `2.5px solid ${accent.color}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  );
                })}
              </div>
            </Section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        aria-label={isOpen ? 'Close tweaks' : 'Open tweaks'}
        onClick={() => setIsOpen((value) => !value)}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
          isOpen
            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
            : 'border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
        }`}
      >
        {isOpen ? <Palette size={18} strokeWidth={1.8} /> : <Settings size={18} strokeWidth={1.8} />}
      </button>
    </div>
  );
}
