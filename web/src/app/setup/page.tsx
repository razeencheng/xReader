'use client';

import { useEffect, useState } from 'react';

interface SetupStatus {
  needs_setup: boolean;
}

export default function SetupPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [skipAI, setSkipAI] = useState(true);

  // Form fields
  const [setupToken, setSetupToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [callbackUrl, setCallbackUrl] = useState(
    typeof window !== 'undefined' ? window.location.origin + '/api/auth/callback' : '',
  );
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [adminUsername, setAdminUsername] = useState('');

  useEffect(() => {
    // Check if setup is needed
    fetch('/api/setup/status')
      .then((res) => res.json())
      .then((data: SetupStatus) => {
        if (!data.needs_setup) {
          window.location.href = '/';
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setError('Failed to check setup status');
        setLoading(false);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        setup_token: setupToken,
        github_client_id: clientId,
        github_client_secret: clientSecret,
        github_callback_url: callbackUrl,
        admin_github_username: adminUsername,
      };

      if (!skipAI) {
        body.ai_endpoint = aiEndpoint;
        body.ai_model = aiModel;
        body.ai_api_key = aiApiKey;
      }

      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Setup failed');
      }

      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)]">
        <p className="text-[var(--text-muted)]">Checking setup status...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-body)] pb-16 text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <header className="mb-10 text-center">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--text-body)]">
            xReader Setup
          </h1>
          <p className="mt-3 font-[system-ui] text-sm leading-6 text-[var(--text-muted)]">
            Configure your xReader instance. You can change these settings later.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-[8px] border border-[var(--border-error)] bg-[var(--bg-highlight-error)] p-4 text-sm text-[var(--text-error)]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Setup Token */}
          <section className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg)] p-5 shadow-[0_18px_40px_rgba(65,52,35,0.06)]">
            <h2 className="mb-4 font-serif text-xl font-semibold text-[var(--text-body)]">
              Setup Token
            </h2>
            <p className="mb-4 font-[system-ui] text-sm text-[var(--text-muted)]">
              Enter the setup token displayed in the server console output.
            </p>
            <input
              type="text"
              className="ui-input font-mono"
              placeholder="Paste setup token from console"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              required
              autoComplete="off"
            />
          </section>

          {/* Section 2: GitHub OAuth */}
          <section className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg)] p-5 shadow-[0_18px_40px_rgba(65,52,35,0.06)]">
            <h2 className="mb-4 font-serif text-xl font-semibold text-[var(--text-body)]">
              GitHub OAuth
            </h2>
            <p className="mb-4 font-[system-ui] text-sm text-[var(--text-muted)]">
              Create a GitHub OAuth App at{' '}
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-text)] underline"
              >
                github.com/settings/developers
              </a>{' '}
              and enter the credentials below.
            </p>
            <div className="space-y-4 font-[system-ui]">
              <label className="block text-sm font-medium text-[var(--text-body)]">
                Client ID
                <input
                  type="text"
                  className="ui-input mt-2"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text-body)]">
                Client Secret
                <input
                  type="password"
                  className="ui-input mt-2"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text-body)]">
                Callback URL
                <input
                  type="url"
                  className="ui-input mt-2"
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  required
                />
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  This must match the callback URL in your GitHub OAuth App settings.
                </span>
              </label>
            </div>
          </section>

          {/* Section 3: AI Service (optional) */}
          <section className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg)] p-5 shadow-[0_18px_40px_rgba(65,52,35,0.06)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-[var(--text-body)]">
                AI Service
              </h2>
              <label className="flex cursor-pointer items-center gap-2 font-[system-ui] text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={skipAI}
                  onChange={(e) => setSkipAI(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Skip for now
              </label>
            </div>
            <p className="mb-4 font-[system-ui] text-sm text-[var(--text-muted)]">
              Optional. Configure an OpenAI-compatible API for title translation and article summaries. You can set this up later in Settings.
            </p>
            {!skipAI ? (
              <div className="space-y-4 font-[system-ui]">
                <label className="block text-sm font-medium text-[var(--text-body)]">
                  Endpoint
                  <input
                    type="url"
                    className="ui-input mt-2"
                    placeholder="https://api.openai.com"
                    value={aiEndpoint}
                    onChange={(e) => setAiEndpoint(e.target.value)}
                    required={!skipAI}
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--text-body)]">
                  Model
                  <input
                    type="text"
                    className="ui-input mt-2"
                    placeholder="gpt-4o-mini"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    required={!skipAI}
                    list="setup-ai-model-options"
                  />
                  <datalist id="setup-ai-model-options">
                    <option value="qwen-turbo" />
                    <option value="deepseek-chat" />
                    <option value="gpt-4o-mini" />
                    <option value="gpt-4.1-mini" />
                  </datalist>
                </label>
                <label className="block text-sm font-medium text-[var(--text-body)]">
                  API Key
                  <input
                    type="password"
                    className="ui-input mt-2"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    required={!skipAI}
                    autoComplete="new-password"
                  />
                </label>
              </div>
            ) : null}
          </section>

          {/* Section 4: Admin */}
          <section className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg)] p-5 shadow-[0_18px_40px_rgba(65,52,35,0.06)]">
            <h2 className="mb-4 font-serif text-xl font-semibold text-[var(--text-body)]">
              Admin Account
            </h2>
            <p className="mb-4 font-[system-ui] text-sm text-[var(--text-muted)]">
              Enter your GitHub username. This account will be the first admin user.
            </p>
            <label className="block font-[system-ui] text-sm font-medium text-[var(--text-body)]">
              GitHub Username
              <input
                type="text"
                className="ui-input mt-2"
                placeholder="octocat"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="ui-btn-solid w-full py-3 text-base"
          >
            {submitting ? 'Setting up...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </main>
  );
}
