'use client';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-8 text-2xl font-semibold text-[var(--text-body)]">xReader</h1>
        <a
          href="/api/auth/github"
          className="inline-block rounded-lg bg-[var(--bg-nav)] px-6 py-3 text-sm font-medium text-[var(--text-inverse)] hover:bg-[var(--bg-surface)]"
        >
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}
