'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface TranslatedParagraph {
  index: number;
  original: string;
  translation: string;
}

interface BatchResponse {
  paragraphs: TranslatedParagraph[];
}

interface UseLazyTranslationOptions {
  articleId: number;
  paragraphTexts: string[];
  enabled: boolean;
}

function extractText(html: string): string {
  if (typeof document === 'undefined') return html;
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').trim();
}

export function useLazyTranslation({ articleId, paragraphTexts, enabled }: UseLazyTranslationOptions) {
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const translationsRef = useRef(translations);
  translationsRef.current = translations;

  const textsRef = useRef(paragraphTexts);
  textsRef.current = paragraphTexts;

  const inFlightRef = useRef(new Set<number>());
  const failedRef = useRef(new Set<number>());
  const pendingRef = useRef(new Set<number>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodesRef = useRef<Map<number, Element>>(new Map());
  const articleIdRef = useRef(articleId);

  useEffect(() => {
    articleIdRef.current = articleId;
    setTranslations(new Map());
    translationsRef.current = new Map();
    inFlightRef.current = new Set();
    failedRef.current = new Set();
    pendingRef.current = new Set();
    nodesRef.current = new Map();
  }, [articleId]);

  const flush = useCallback(() => {
    const currentArticleId = articleIdRef.current;
    const indices = [...pendingRef.current].filter(
      (i) => !inFlightRef.current.has(i) && !failedRef.current.has(i) && !translationsRef.current.has(i),
    );
    pendingRef.current.clear();
    if (indices.length === 0) return;

    for (const i of indices) inFlightRef.current.add(i);

    const paragraphs = indices.map((i) => ({
      index: i,
      text: extractText(textsRef.current[i] ?? ''),
    }));

    apiFetch<BatchResponse>(`/api/articles/${currentArticleId}/body-translation`, {
      method: 'POST',
      body: JSON.stringify({ paragraphs }),
    })
      .then((data) => {
        if (articleIdRef.current !== currentArticleId) return;
        setTranslations((prev) => {
          const next = new Map(prev);
          for (const p of data.paragraphs) {
            next.set(p.index, p.translation);
          }
          return next;
        });
      })
      .catch(() => {
        for (const i of indices) failedRef.current.add(i);
      })
      .finally(() => {
        for (const i of indices) inFlightRef.current.delete(i);
      });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, 100);
  }, [flush]);

  useEffect(() => {
    if (!enabled || paragraphTexts.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.getAttribute('data-paragraph-index'));
          if (Number.isNaN(idx)) continue;
          if (
            !translationsRef.current.has(idx) &&
            !inFlightRef.current.has(idx) &&
            !failedRef.current.has(idx)
          ) {
            pendingRef.current.add(idx);
          }
        }
        if (pendingRef.current.size > 0) scheduleFlush();
      },
      { rootMargin: '0px 0px 1500px 0px' },
    );

    const observer = observerRef.current;
    for (const [, node] of nodesRef.current) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, paragraphTexts.length, scheduleFlush]);

  const observeRef = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      if (node) {
        nodesRef.current.set(index, node);
        observerRef.current?.observe(node);
      } else {
        const prev = nodesRef.current.get(index);
        if (prev) observerRef.current?.unobserve(prev);
        nodesRef.current.delete(index);
      }
    },
    [],
  );

  return { translations, observeRef };
}
