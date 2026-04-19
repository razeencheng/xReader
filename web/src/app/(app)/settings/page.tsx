'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore, type Theme } from '@/stores/useUIStore';
import { apiFetch } from '@/lib/api-client';

const LANGUAGES = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
] as const;

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

const SHARED_BUTTON =
  'px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f1f1f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]';

function getSegmentedButtonClass(isActive: boolean, isFirst: boolean, isLast: boolean) {
  return [
    SHARED_BUTTON,
    'border border-[#ece6d8]',
    isActive ? 'bg-[#1f1f1f] text-white' : 'bg-white text-[#8a8275] hover:bg-[#f5f0e6]',
    isFirst ? 'rounded-l-full' : '',
    isLast ? 'rounded-r-full' : '',
    !isFirst ? '-ml-px' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { density, theme, nativeLanguage, toggleDensity, setTheme } = useUIStore((state) => ({
    density: state.density,
    theme: state.theme,
    nativeLanguage: state.nativeLanguage,
    toggleDensity: state.toggleDensity,
    setTheme: state.setTheme,
  }));
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [isLanguageWarningOpen, setIsLanguageWarningOpen] = useState(false);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);

  const handleLanguageSelect = (value: string) => {
    if (value === nativeLanguage) {
      return;
    }

    setPendingLanguage(value);
    setIsLanguageWarningOpen(true);
  };

  const cancelLanguageChange = () => {
    setIsLanguageWarningOpen(false);
    setPendingLanguage(null);
  };

  const confirmLanguageChange = async () => {
    if (!pendingLanguage) {
      return;
    }

    setIsSavingLanguage(true);

    try {
      await apiFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ native_language: pendingLanguage }),
      });
      await useAuthStore.getState().fetchMe();
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
    } finally {
      setIsSavingLanguage(false);
      setIsLanguageWarningOpen(false);
      setPendingLanguage(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#1f1f1f]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-[#8a8275] transition-colors hover:text-[#1f1f1f]">
          ← 返回
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm text-[#8a8275]">调整母语、显示密度与主题偏好。</p>
        </header>

        <div className="space-y-8">
          <section className="space-y-3 rounded-2xl border border-[#ece6d8] bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="space-y-1">
              <label htmlFor="native-language" className="block text-sm font-medium text-[#1f1f1f]">
                母语
              </label>
              <p className="text-sm text-[#8a8275]">切换后会影响文章翻译与摘要的显示语言。</p>
            </div>

            <select
              id="native-language"
              value={isLanguageWarningOpen && pendingLanguage ? pendingLanguage : nativeLanguage}
              onChange={(event) => handleLanguageSelect(event.target.value)}
              className="w-full max-w-xs rounded-xl border border-[#ece6d8] bg-[#fbfaf7] px-3 py-2 text-sm text-[#1f1f1f] outline-none transition-colors focus:border-[#1f1f1f]"
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>

            {isLanguageWarningOpen ? (
              <div className="rounded-xl border border-[#ece6d8] bg-[#fbfaf7] p-4 text-sm text-[#8a8275]">
                <p>
                  切换母语后，已生成的翻译结果需要重新生成才会显示新语言。已有文章的翻译不会自动重翻。
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={confirmLanguageChange}
                    disabled={isSavingLanguage}
                    className="rounded-full bg-[#1f1f1f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#353535] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingLanguage ? '保存中…' : '确认切换'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelLanguageChange}
                    disabled={isSavingLanguage}
                    className="rounded-full border border-[#ece6d8] bg-white px-4 py-2 text-sm font-medium text-[#8a8275] transition-colors hover:bg-[#f5f0e6] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-2xl border border-[#ece6d8] bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-[#1f1f1f]">显示密度</h2>
              <p className="text-sm text-[#8a8275]">舒适模式适合长时间浏览，紧凑模式更适合快速扫读。</p>
            </div>

            <div className="inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (density !== 'comfortable') {
                    toggleDensity();
                  }
                }}
                className={getSegmentedButtonClass(density === 'comfortable', true, false)}
              >
                舒适
              </button>
              <button
                type="button"
                onClick={() => {
                  if (density !== 'compact') {
                    toggleDensity();
                  }
                }}
                className={getSegmentedButtonClass(density === 'compact', false, true)}
              >
                紧凑
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[#ece6d8] bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-[#1f1f1f]">主题</h2>
              <p className="text-sm text-[#8a8275]">选择亮色、深色或跟随系统外观。</p>
            </div>

            <div className="inline-flex flex-wrap items-center">
              {THEMES.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={getSegmentedButtonClass(theme === option.value, index === 0, index === THEMES.length - 1)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-[#ece6d8] pt-4 text-sm text-[#8a8275]">
            <p>
              当前登录账号：<span className="font-medium text-[#1f1f1f]">{user?.github_username ?? '未登录'}</span>
            </p>
            <p className="mt-1">母语、密度与主题设置会同步到你的账户与本地界面。</p>
          </section>
        </div>
      </div>
    </main>
  );
}
