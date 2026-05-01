'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { useAuthStore } from '@/stores/useAuthStore';

interface AISettings {
  endpoint: string;
  model: string;
  api_key_set: boolean;
  api_key_hint?: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setAPIKey] = useState('');
  const [message, setMessage] = useState('');

  const { data: aiSettings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => apiFetch<AISettings>('/api/ai/settings'),
  });

  useEffect(() => {
    if (!aiSettings) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEndpoint(aiSettings.endpoint);
      setModel(aiSettings.model);
    });
    return () => {
      cancelled = true;
    };
  }, [aiSettings]);

  const saveAISettings = useMutation({
    mutationFn: () =>
      apiFetch<AISettings>('/api/ai/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          endpoint,
          model,
          api_key: apiKey,
        }),
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(['ai-settings'], settings);
      setEndpoint(settings.endpoint);
      setModel(settings.model);
      setAPIKey('');
      setMessage(t('settings.aiSaved'));
    },
    onError: () => setMessage(t('settings.aiSaveError')),
  });

  return (
    <main className="h-full overflow-y-auto bg-[var(--bg-body)] pb-[env(safe-area-inset-bottom)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="font-[system-ui] text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]">
            ← {t('settings.backHome')}
          </Link>
          <div className="font-[system-ui] text-sm text-[var(--text-muted)]">
            {t('settings.breadcrumb')}
          </div>
        </div>

        <header className="mb-8 space-y-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--text-body)]">{t('settings.title')}</h1>
          <p className="max-w-2xl font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">
            {t('settings.description')}
          </p>
        </header>

        <section className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg)] p-5 shadow-[0_18px_40px_rgba(65,52,35,0.06)]">
          <div className="mb-5">
            <h2 className="font-serif text-2xl font-semibold text-[var(--text-body)]">{t('settings.aiTitle')}</h2>
            <p className="mt-2 font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">{t('settings.aiDescription')}</p>
          </div>

          <div className="space-y-4 font-[system-ui]">
            <label className="block text-sm font-medium text-[var(--text-body)]">
              {t('settings.aiEndpoint')}
              <input
                className="mt-2 w-full rounded-[7px] border border-[var(--border-light)] bg-[var(--bg-body)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                value={endpoint}
                disabled={!isAdmin}
                onChange={(event) => setEndpoint(event.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-[var(--text-body)]">
              {t('settings.aiModel')}
              <input
                list="ai-model-options"
                className="mt-2 w-full rounded-[7px] border border-[var(--border-light)] bg-[var(--bg-body)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                value={model}
                disabled={!isAdmin}
                onChange={(event) => setModel(event.target.value)}
              />
              <datalist id="ai-model-options">
                <option value="qwen-turbo" />
                <option value="deepseek-chat" />
                <option value="gpt-4o-mini" />
                <option value="gpt-4.1-mini" />
              </datalist>
            </label>

            <label className="block text-sm font-medium text-[var(--text-body)]">
              {t('settings.aiApiKey')}
              <input
                type="password"
                autoComplete="new-password"
                placeholder={t('settings.aiApiKeyPlaceholder')}
                className="mt-2 w-full rounded-[7px] border border-[var(--border-light)] bg-[var(--bg-body)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                value={apiKey}
                disabled={!isAdmin}
                onChange={(event) => setAPIKey(event.target.value)}
              />
            </label>

            <p className="text-xs text-[var(--text-muted)]">
              {aiSettings?.api_key_set
                ? t('settings.aiCurrentKey', { hint: aiSettings.api_key_hint || '***' })
                : t('settings.aiNoKey')}
            </p>
            {!isAdmin ? <p className="text-xs text-[var(--text-muted)]">{t('settings.aiAdminOnly')}</p> : null}

            <div className="flex items-center gap-3">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => saveAISettings.mutate()}
                  disabled={saveAISettings.isPending}
                  className="rounded-[7px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                >
                  {saveAISettings.isPending ? t('settings.saving') : t('settings.aiSave')}
                </button>
              ) : null}
              {message ? <span className="text-sm text-[var(--text-muted)]">{message}</span> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
