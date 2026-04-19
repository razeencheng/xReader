'use client';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-8 text-2xl font-semibold text-[#1f1f1f]">xReader</h1>
        <a
          href="/api/auth/github"
          className="inline-block rounded-lg bg-[#1f1f1f] px-6 py-3 text-sm font-medium text-white hover:bg-[#333]"
        >
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}
