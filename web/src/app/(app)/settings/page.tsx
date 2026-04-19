'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore, type Density, type Theme } from '@/stores/useUIStore';

type SettingKey = 'native_language' | 'density_pref' | 'theme_pref';

interface UserSettings {
  native_language: string;
  density_pref: Density;
  theme_pref: Theme;
}

const LANGUAGES = [
  { value: 'zh-CN', label: 'zh-CN' },
  { value: 'zh-TW', label: 'zh-TW' },
  { value: 'en-US', label: 'en-US' },
  { value: 'ja-JP', label: 'ja-JP' },
  { value: 'ko-KR', label: 'ko-KR' },
] as const;

const DENSITY_OPTIONS: { value: Density; label: string; description: string }[] = [
  { value: 'comfortable', label: 'comfortable', description: '更松弛，适合长时间阅读。' },
  { value: 'compact', label: 'compact', description: '更紧凑，适合快速扫读。' },
];

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: 'light', label: '浅色', description: '明亮、清爽的浅色界面。' },
  { value: 'dark', label: '深色', description: '夜间更舒适的深色界面。' },
  { value: 'system', label: '跟随系统', description: '沿用设备或系统外观设置。' },
];

const SELECT_CLASS =
  'w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-body)] px-4 py-3 font-[system-ui] text-sm text-[var(--text-body)] outline-none transition-colors focus:border-[var(--border-accent)] focus:ring-2 focus:ring-[var(--accent)]/20';
const SEGMENT_CLASS =
  'rounded-full border border-[var(--border-default)] px-4 py-2 font-[system-ui] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]';

function buildPatchPayload(current: UserSettings, initial: UserSettings) {
  const payload: Partial<Record<SettingKey, string>> = {};

  if (current.native_language !== initial.native_language) {
    payload.native_language = current.native_language;
  }
  if (current.density_pref !== initial.density_pref) {
    payload.density_pref = current.density_pref;
  }
  if (current.theme_pref !== initial.theme_pref) {
    payload.theme_pref = current.theme_pref;
  }

  return payload;
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-input)]/80 p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="mb-4 space-y-1">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--text-body)]">{title}</h2>
        <p className="font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const hydrate = useUIStore((state) => state.hydrate);
  const authFetchMe = useAuthStore((state) => state.fetchMe);
  const [initialSettings, setInitialSettings] = useState<UserSettings | null>(null);
  const [formSettings, setFormSettings] = useState<UserSettings | null>(null);

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<UserSettings>('/api/users/me'),
  });

  useEffect(() => {
    if (!settings) {
      return;
    }

    setInitialSettings(settings);
    setFormSettings(settings);
  }, [settings]);

  const hasChanges = useMemo(() => {
    if (!initialSettings || !formSettings) {
      return false;
    }

    return Object.keys(buildPatchPayload(formSettings, initialSettings)).length > 0;
  }, [formSettings, initialSettings]);

  const saveMutation = useMutation({
    mutationFn: async (nextSettings: UserSettings) => {
      if (!initialSettings) {
        return;
      }

      const payload = buildPatchPayload(nextSettings, initialSettings);
      if (Object.keys(payload).length === 0) {
        return;
      }

      await apiFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (_result, nextSettings) => {
      hydrate({
        native_language: nextSettings.native_language,
        density_pref: nextSettings.density_pref,
        theme_pref: nextSettings.theme_pref,
      });
      await Promise.all([
        authFetchMe(),
        queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['articles'] }),
        queryClient.invalidateQueries({ queryKey: ['article-ai'] }),
      ]);
      setInitialSettings(nextSettings);
    },
  });

  const setSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setFormSettings((current) => {
      if (!current) {
        return current;
      }

      return { ...current, [key]: value };
    });
  };

  const onSave = () => {
    if (!formSettings || !hasChanges) {
      return;
    }

    saveMutation.mutate(formSettings);
  };

  if (isLoading || !formSettings || !initialSettings) {
    return (
      <main className="min-h-screen bg-[var(--bg-body)] text-[var(--text-body)]">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
          <p className="font-[system-ui] text-sm text-[var(--text-muted)]">加载设置中…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-body)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="font-[system-ui] text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]">
            ← 返回首页
          </Link>
          <div className="font-[system-ui] text-sm text-[var(--text-muted)]">
            主页 / 设置
          </div>
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 font-[system-ui] text-xs text-[var(--text-muted)]">
          <span aria-hidden="true">⚙</span>
          <span>偏好设置</span>
        </div>

        <header className="mb-8 space-y-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--text-body)]">设置</h1>
          <p className="max-w-2xl font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">
            调整母语、显示密度与主题偏好。更改后点击保存即可同步到账户。
          </p>
        </header>

        <div className="space-y-6">
          <SettingsSection
            title="Native Language"
            description="切换后会影响翻译、摘要和正文语言的展示。"
          >
            <label className="block space-y-2">
              <span className="font-[system-ui] text-sm font-medium text-[var(--text-body)]">母语</span>
              <select
                value={formSettings.native_language}
                onChange={(event) => setSetting('native_language', event.target.value)}
                className={SELECT_CLASS}
              >
                {LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>

            {formSettings.native_language !== initialSettings.native_language ? (
              <div className="mt-3 rounded-2xl border border-[var(--border-callout)] bg-[var(--bg-badge-unread)] px-4 py-3 font-[system-ui] text-sm leading-6 text-[var(--text-warning)]">
                切换母语后，已生成的翻译结果需要重新生成才会显示新语言。已有文章的翻译不会自动重翻。
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection
            title="Display Density"
            description="舒适模式更适合长时间浏览，紧凑模式更适合快速扫读。"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {DENSITY_OPTIONS.map((option) => {
                const active = formSettings.density_pref === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSetting('density_pref', option.value)}
                    aria-pressed={active}
                    className={`${SEGMENT_CLASS} text-left ${
                      active
                        ? 'border-[var(--bg-nav)] bg-[var(--bg-nav)] text-[var(--text-inverse)]'
                        : 'bg-[var(--bg-body)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className={`mt-1 text-xs leading-5 ${active ? 'text-[var(--text-inverse)]/75' : 'text-[var(--text-muted)]'}`}>
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection title="Theme" description="选择亮色、深色或跟随系统外观。">
            <div className="flex flex-wrap gap-3">
              {THEME_OPTIONS.map((option) => {
                const active = formSettings.theme_pref === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSetting('theme_pref', option.value)}
                    aria-pressed={active}
                    className={`${SEGMENT_CLASS} ${
                      active
                        ? 'border-[var(--border-accent)] bg-[var(--accent)] text-[var(--text-body)]'
                        : 'bg-[var(--bg-body)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </SettingsSection>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border-default)] pt-6">
          <div className="font-[system-ui] text-sm text-[var(--text-muted)]">
            {hasChanges ? '有未保存的更改。' : '所有设置已保存。'}
            {isError ? ' 设置加载失败，请稍后重试。' : ''}
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges || saveMutation.isPending}
            className="rounded-full bg-[var(--bg-nav)] px-5 py-2.5 font-[system-ui] text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>
    </main>
  );
}
