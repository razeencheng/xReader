'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Globe, Keyboard, LogOut, PlusCircle, Settings, ShieldCheck } from 'lucide-react';
import { LanguageModal } from '@/components/layout/LanguageModal';
import { getLanguageOption, PRIMARY_NAV_ITEMS } from '@/components/layout/navigationConfig';
import { useI18n } from '@/lib/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore, type ViewTab } from '@/stores/useUIStore';

const NAV_LABEL_KEYS: Record<ViewTab, string> = {
  today: 'nav.today',
  all: 'nav.all',
  starred: 'nav.starred',
  sources: 'nav.sources',
};

function useAppNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const currentView = useUIStore((state) => state.currentView);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const nativeLanguage = useUIStore((state) => state.nativeLanguage);
  const setNativeLanguage = useUIStore((state) => state.setNativeLanguage);
  const openShortcuts = useUIStore((state) => state.openShortcuts);
  const { t } = useI18n();

  const currentLanguage = useMemo(
    () => getLanguageOption(nativeLanguage),
    [nativeLanguage],
  );

  const goToView = (view: ViewTab) => {
    setCurrentView(view, view === 'sources' ? null : undefined);
    if (pathname !== '/') {
      router.push('/');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return {
    currentLanguage,
    currentView,
    goToView,
    handleLogout,
    isAdmin: user?.role === 'admin',
    nativeLanguage,
    openShortcuts,
    pathname,
    router,
    setNativeLanguage,
    t,
  };
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof PRIMARY_NAV_ITEMS[number]['icon'];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[11px] px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
          : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]'
      }`}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  );
}

export function TabletTopNav({ focusMode }: { focusMode: boolean }) {
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const nav = useAppNavigation();

  if (focusMode) {
    return null;
  }

  return (
    <>
      <header className="glass-effect hidden h-14 shrink-0 items-center justify-between gap-4 px-4 md:flex lg:hidden">
        <button
          type="button"
          onClick={() => nav.goToView('today')}
          className="font-serif text-[19px] font-semibold italic tracking-[-0.08em] text-[var(--accent)]"
        >
          xReader
        </button>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              active={nav.currentView === item.id && nav.pathname === '/'}
              icon={item.icon}
              label={nav.t(NAV_LABEL_KEYS[item.id])}
              onClick={() => nav.goToView(item.id)}
            />
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {nav.isAdmin ? (
            <button
              type="button"
              title={nav.t('nav.admin')}
              onClick={() => nav.router.push('/admin')}
              className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
                nav.pathname === '/admin'
                  ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
                  : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]'
              }`}
            >
              <ShieldCheck size={16} strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="button"
            title={nav.t('nav.nativeLanguageTitle', { language: nav.currentLanguage.name })}
            onClick={() => setIsLanguageOpen(true)}
            className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[12px] font-semibold text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
          >
            <Globe size={15} strokeWidth={1.75} />
            {nav.currentLanguage.short}
          </button>
          <button
            type="button"
            title={nav.t('shortcuts.open')}
            onClick={nav.openShortcuts}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-3)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
          >
            <Keyboard size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title={nav.t('nav.settings')}
            onClick={() => nav.router.push('/settings')}
            className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
              nav.pathname === '/settings'
                ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
                : 'text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]'
            }`}
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {isLanguageOpen ? (
        <LanguageModal
          currentLanguage={nav.nativeLanguage}
          onSelect={nav.setNativeLanguage}
          onClose={() => setIsLanguageOpen(false)}
        />
      ) : null}
    </>
  );
}

export function MobileTopBar({ focusMode }: { focusMode: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const nav = useAppNavigation();

  if (focusMode) {
    return null;
  }

  return (
    <>
      <header className="glass-effect flex h-14 shrink-0 items-center justify-between px-4 md:hidden">
        <button
          type="button"
          onClick={() => nav.goToView('today')}
          className="font-serif text-xl font-bold italic tracking-tight text-[var(--accent)]"
        >
          xReader
        </button>
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] shadow-[0_10px_30px_rgba(65,52,35,0.08)]"
        >
          {nav.t('nav.more')}
          <ChevronDown size={13} strokeWidth={1.8} />
        </button>
      </header>

      {isMenuOpen ? (
        <div className="fixed right-3 top-[58px] z-[130] w-[210px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.16)] md:hidden">
          <button
            type="button"
            onClick={() => {
              setIsLanguageOpen(true);
              setIsMenuOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            <span className="inline-flex items-center gap-2">
              <Globe size={15} />
              {nav.t('nav.nativeLanguage')}
            </span>
            <span className="text-[11px] font-semibold text-[var(--accent)]">{nav.currentLanguage.short}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              nav.openShortcuts();
              setIsMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            <Keyboard size={15} />
            {nav.t('shortcuts.title')}
          </button>
          <button
            type="button"
            onClick={() => {
              nav.router.push('/sources');
              setIsMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            <PlusCircle size={15} />
            {nav.t('nav.manageSources')}
          </button>
          {nav.isAdmin ? (
            <button
              type="button"
              onClick={() => {
                nav.router.push('/admin');
                setIsMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
            >
              <ShieldCheck size={15} />
              {nav.t('nav.admin')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void nav.handleLogout();
              setIsMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            <LogOut size={15} />
            {nav.t('nav.logOut')}
          </button>
        </div>
      ) : null}

      {isLanguageOpen ? (
        <LanguageModal
          currentLanguage={nav.nativeLanguage}
          onSelect={nav.setNativeLanguage}
          onClose={() => setIsLanguageOpen(false)}
        />
      ) : null}
    </>
  );
}

export function MobileBottomNav({ focusMode }: { focusMode: boolean }) {
  const nav = useAppNavigation();

  if (focusMode) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] grid h-[68px] grid-cols-5 border-t border-[var(--border)] bg-[rgba(252,250,246,0.94)] px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-18px_50px_rgba(65,52,35,0.08)] backdrop-blur md:hidden">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = nav.currentView === item.id && nav.pathname === '/';
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.goToView(item.id)}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[11px] font-medium transition-colors ${
              active ? 'bg-[var(--accent-bg)] text-[var(--accent)]' : 'text-[var(--text-3)]'
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{nav.t(NAV_LABEL_KEYS[item.id])}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => nav.router.push('/settings')}
        className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[11px] font-medium transition-colors ${
          nav.pathname === '/settings' ? 'bg-[var(--accent-bg)] text-[var(--accent)]' : 'text-[var(--text-3)]'
        }`}
      >
        <Settings size={18} strokeWidth={1.8} />
        <span>{nav.t('nav.settings')}</span>
      </button>
    </nav>
  );
}
