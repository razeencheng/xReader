'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useUIStore } from '@/stores/useUIStore';
import { ReaderHeader } from '@/components/reader/ReaderHeader';
import { KeyPointsCallout } from '@/components/reader/KeyPointsCallout';
import { BilingualBody } from '@/components/reader/BilingualBody';
import { PrevNextBar } from '@/components/reader/PrevNextBar';
import { NextUpCard } from '@/components/reader/NextUpCard';
import { useArticleNeighbors } from '@/lib/queries/neighbors';
import type { ArticleItem, ArticleTab } from '@/lib/types';

interface ArticleDetail extends ArticleItem {
  content_html?: string;
  content_text?: string;
  is_read?: boolean;
  is_starred?: boolean;
  reading_progress?: unknown;
}

interface ArticleAI {
  title_translated?: string;
  summary?: string;
  body_translation_status?: string;
  body_translation_content?: string;
}

function normalizeTab(value: string | null): ArticleTab {
  return value === 'stream' || value === 'starred' ? value : 'today';
}

function ReaderContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nativeLanguage = useUIStore((s) => s.nativeLanguage);
  const tab = normalizeTab(searchParams.get('ctx') ?? searchParams.get('tab'));
  const articleId = Number(id);

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => apiFetch<ArticleDetail>(`/api/articles/${id}`),
  });

  const { data: ai } = useQuery({
    queryKey: ['article-ai', id, nativeLanguage],
    queryFn: () => apiFetch<ArticleAI>(`/api/articles/${id}/ai?lang=${nativeLanguage}`).catch(() => null),
    enabled: !!article,
  });

  const { prev, next, position, total } = useArticleNeighbors(articleId, tab);

  const markRead = (articleToMarkReadId: number) => {
    void apiFetch(`/api/articles/${articleToMarkReadId}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    }).catch(() => undefined);
  };

  if (isLoading || !article) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfbf6]">
        <p className="text-sm text-[#8a8275]">Loading…</p>
      </div>
    );
  }

  const displayTitle = ai?.title_translated || article.title_translated || article.title;
  const originalTitle = article.title;
  const isNative = article.language.toLowerCase().startsWith(nativeLanguage.toLowerCase().slice(0, 2));
  const showOriginal = !isNative && displayTitle !== originalTitle;
  const summary = ai?.summary || article.summary || '';

  return (
    <div className="min-h-screen bg-[#fdfbf6]">
      <ReaderHeader
        article={{ ...article, title_translated: displayTitle }}
        nativeLanguage={nativeLanguage}
        position={position}
        total={total}
        onBack={() => {
          const ctx = searchParams.get('ctx');
          const params = new URLSearchParams();
          if (ctx) params.set('tab', ctx);
          router.push(`/?${params.toString()}`);
        }}
        onToggleStar={() => {
          apiFetch(`/api/articles/${id}/state`, {
            method: 'PATCH',
            body: JSON.stringify({ is_starred: !article.is_starred }),
          });
        }}
      />

      <article className="mx-auto max-w-[680px] px-12 pb-6 pt-9 font-serif text-[#1f1f1f]">
        <h1 className="mb-1.5 text-[32px] font-bold leading-[1.25]">{displayTitle}</h1>
        {showOriginal ? (
          <div className="mb-1.5 font-[system-ui] text-[13px] italic text-[#8a8275]">{originalTitle}</div>
        ) : null}
        <div className="mb-6 font-[system-ui] text-[13px] text-[#8a8275]">
          {article.author && `${article.author} · `}
          {article.published_at && new Date(article.published_at).toLocaleString()}
        </div>

        {summary ? <KeyPointsCallout text={summary} /> : null}

        {article.content_html ? (
          <BilingualBody
            articleId={article.id}
            contentHtml={article.content_html}
            language={article.language}
            nativeLanguage={nativeLanguage}
          />
        ) : (
          <p className="text-base leading-[1.8] text-[#1f1f1f]">{article.content_text}</p>
        )}

        {next ? <NextUpCard next={next} currentId={article.id} markRead={markRead} /> : null}

        <div className="mt-8 text-center font-[system-ui] text-xs text-[#b5aea0]">— 文末 —</div>
      </article>

      <PrevNextBar
        current={article}
        prev={prev}
        next={next}
        position={position}
        total={total}
        markRead={markRead}
      />
    </div>
  );
}

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fdfbf6]">
          <p className="text-sm text-[#8a8275]">Loading…</p>
        </div>
      }
    >
      <ReaderContent id={id} />
    </Suspense>
  );
}
