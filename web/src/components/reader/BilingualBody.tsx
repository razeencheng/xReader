'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { createSSEClient, type SSEClient } from '@/lib/sse-client';
import { fontForLang } from '@/lib/langFonts';
import { isSameLanguage } from '@/lib/article-meta';
import { useI18n } from '@/lib/i18n';

interface Props {
  articleId: number;
  contentHtml: string;
  language: string;
  nativeLanguage: string;
}

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'details',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const WRAPPER_TAGS = new Set(['article', 'aside', 'div', 'footer', 'header', 'main', 'section']);
const SKIP_EMPTY_TAGS = new Set(['br', 'ins']);
const TRANSLATION_PREFETCH_COUNT = 5;

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function primaryTagFromHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const firstElement = doc.body.firstElementChild;
  return firstElement?.tagName.toLowerCase() ?? 'p';
}

function isFilenameLikeAlt(text: string, src: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const basename = src.split('/').pop()?.split('?')[0]?.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  return normalized === basename || /^image[-_]\d+$/i.test(normalized);
}

function removeHiddenHeadingAnchors(root: HTMLElement) {
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.querySelectorAll('a[hidden], a.anchor[aria-hidden="true"]').forEach((anchor) => {
      anchor.remove();
    });

    const text = heading.textContent?.trim() ?? '';
    if (text.length > 2 && text.endsWith('#') && !text.endsWith('C#') && !text.endsWith('F#')) {
      heading.textContent = text.slice(0, -1).trim();
    }
  });
}

function normalizeReaderImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src')?.trim();
    if (src && /^https?:\/\//i.test(src) && !src.startsWith('/api/images/proxy')) {
      image.setAttribute('data-original-src', src);
      image.setAttribute('src', `/api/images/proxy?url=${encodeURIComponent(src)}`);
    }

    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');

    const width = Number.parseInt(image.getAttribute('width') ?? '', 10);
    const height = Number.parseInt(image.getAttribute('height') ?? '', 10);
    if (width > 0 && height > 0) {
      const existingStyle = image.getAttribute('style')?.trim();
      const stableStyle = `aspect-ratio: ${width} / ${height}; max-width: ${width}px !important;`;
      image.setAttribute('style', existingStyle ? `${existingStyle}; ${stableStyle}` : stableStyle);
    } else {
      const existingStyle = image.getAttribute('style')?.trim();
      const stableStyle = 'aspect-ratio: 16 / 9; min-height: 12rem;';
      image.setAttribute('style', existingStyle ? `${existingStyle}; ${stableStyle}` : stableStyle);
    }

    const alt = image.getAttribute('alt')?.trim() ?? '';
    if (src && isFilenameLikeAlt(alt, src)) {
      image.setAttribute('data-original-alt', alt);
      image.setAttribute('alt', '');
    }
  });
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
  });
}

function splitContentHtml(contentHtml: string) {
  const sanitized = sanitizeHtml(contentHtml);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${sanitized}</body>`, 'text/html');
  removeHiddenHeadingAnchors(doc.body);
  normalizeReaderImages(doc.body);
  const paragraphs: string[] = [];

  const pushText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      paragraphs.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  };

  const traverseNodes = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (SKIP_EMPTY_TAGS.has(tag) && !element.textContent?.trim()) {
      return;
    }

    if (WRAPPER_TAGS.has(tag)) {
      Array.from(element.childNodes).forEach(traverseNodes);
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      paragraphs.push(element.outerHTML);
      return;
    }

    paragraphs.push(`<p>${element.outerHTML}</p>`);
  };

  Array.from(doc.body.childNodes).forEach(traverseNodes);
  return paragraphs;
}

export function BilingualBody({ articleId, contentHtml, language, nativeLanguage }: Props) {
  const { t } = useI18n();
  const paragraphs = useMemo(() => splitContentHtml(contentHtml), [contentHtml]);
  const sameLanguage = isSameLanguage(language, nativeLanguage);
  const originalFont = fontForLang(language);
  const translationFont = fontForLang(nativeLanguage);
  const resetKey = `${articleId}:${language}:${nativeLanguage}:${contentHtml}`;
  const paragraphRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeClientsRef = useRef<SSEClient[]>([]);
  const requestedIndicesRef = useRef<Set<number>>(new Set());
  const translationsRef = useRef<Map<number, string>>(new Map());
  const [translationState, setTranslationState] = useState<{
    key: string;
    translations: Map<number, string>;
    pending: Set<number>;
  }>({
    key: '',
    translations: new Map(),
    pending: new Set(),
  });

  const shouldTranslate = !sameLanguage && paragraphs.length > 0;
  const translations = translationState.key === resetKey ? translationState.translations : new Map<number, string>();
  const pendingTranslations = translationState.key === resetKey ? translationState.pending : new Set<number>();

  useEffect(() => {
    translationsRef.current = translations;
  }, [translations]);

  useEffect(() => {
    requestedIndicesRef.current.clear();
    activeClientsRef.current.forEach((client) => client.close());
    activeClientsRef.current = [];
    return () => {
      activeClientsRef.current.forEach((client) => client.close());
      activeClientsRef.current = [];
    };
  }, [resetKey]);

  const requestTranslationRange = useCallback((visibleIndex: number) => {
    if (!shouldTranslate || visibleIndex < 0 || visibleIndex >= paragraphs.length) {
      return;
    }

    const rangeEnd = Math.min(paragraphs.length, visibleIndex + TRANSLATION_PREFETCH_COUNT);
    const rangeIndices = Array.from(
      { length: rangeEnd - visibleIndex },
      (_, offset) => visibleIndex + offset,
    );
    const firstMissingIndex = rangeIndices.find(
      (index) => !translationsRef.current.has(index) && !requestedIndicesRef.current.has(index),
    );
    if (firstMissingIndex === undefined) {
      return;
    }

    const requestIndices = Array.from(
      { length: rangeEnd - firstMissingIndex },
      (_, offset) => firstMissingIndex + offset,
    );
    const loadingIndex = firstMissingIndex === visibleIndex ? visibleIndex : null;
    requestIndices.forEach((index) => requestedIndicesRef.current.add(index));
    setTranslationState((previous) => {
      const nextTranslations = previous.key === resetKey ? previous.translations : new Map<number, string>();
      const nextPending = previous.key === resetKey ? new Set(previous.pending) : new Set<number>();
      if (loadingIndex !== null && !nextTranslations.has(loadingIndex)) {
        nextPending.add(loadingIndex);
      }
      return { key: resetKey, translations: nextTranslations, pending: nextPending };
    });

    const params = new URLSearchParams({
      start: String(firstMissingIndex),
      count: String(rangeEnd - firstMissingIndex),
    });
    const client = createSSEClient(`/api/articles/${articleId}/body-translation?${params.toString()}`);
    activeClientsRef.current.push(client);

    const removeClient = () => {
      activeClientsRef.current = activeClientsRef.current.filter((item) => item !== client);
    };
    const clearPending = () => {
      setTranslationState((previous) => {
        if (previous.key !== resetKey) {
          return previous;
        }
        const nextPending = new Set(previous.pending);
        if (loadingIndex !== null) {
          nextPending.delete(loadingIndex);
        }
        return { ...previous, pending: nextPending };
      });
    };

    client.onParagraph((paragraph) => {
      setTranslationState((previous) => {
        const nextTranslations = previous.key === resetKey ? new Map(previous.translations) : new Map<number, string>();
        const nextPending = previous.key === resetKey ? new Set(previous.pending) : new Set<number>();
        nextTranslations.set(paragraph.index, paragraph.translation);
        nextPending.delete(paragraph.index);
        return { key: resetKey, translations: nextTranslations, pending: nextPending };
      });
    });
    client.onDone(() => {
      clearPending();
      removeClient();
    });
    client.onError(() => {
      requestIndices.forEach((index) => requestedIndicesRef.current.delete(index));
      clearPending();
      removeClient();
    });
  }, [articleId, paragraphs.length, resetKey, shouldTranslate]);

  useEffect(() => {
    if (!shouldTranslate) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const index = Number.parseInt((entry.target as HTMLElement).dataset.observeIndex ?? '', 10);
        if (Number.isFinite(index)) {
          requestTranslationRange(index);
        }
      });
    }, { rootMargin: '320px 0px 520px 0px', threshold: 0.01 });

    paragraphRefs.current.slice(0, paragraphs.length).forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [paragraphs.length, requestTranslationRange, shouldTranslate]);

  return (
    <div className="reader-content">
      {paragraphs.map((paragraph, index) => {
        const blockTag = primaryTagFromHtml(paragraph);
        const isCode = blockTag === 'pre';
        const translation = translations.get(index);
        const isLoading = pendingTranslations.has(index) && !translation;

        if (isCode) {
          return (
            <div
              key={index}
              ref={(node) => {
                paragraphRefs.current[index] = node;
              }}
              data-observe-index={index}
              data-block-tag={blockTag}
              className="overflow-x-auto rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] p-4 font-mono text-[13.5px] leading-[1.6] text-[var(--text-primary)]"
              dangerouslySetInnerHTML={{ __html: paragraph }}
            />
          );
        }

        return (
          <div
            key={index}
            ref={(node) => {
              paragraphRefs.current[index] = node;
            }}
            data-observe-index={index}
            data-block-tag={blockTag}
            className="paragraph-container"
          >
            <div
              data-layer="original"
              data-paragraph-index={index}
              style={{ fontFamily: originalFont }}
            >
              <div dangerouslySetInnerHTML={{ __html: paragraph }} />
            </div>

            {translation ? (
              <div
                data-layer="translation"
                data-paragraph-index={index}
                className="mt-1 text-[0.92em] leading-[1.85] text-[var(--text)]"
                style={{ fontFamily: translationFont }}
              >
                {translation}
              </div>
            ) : isLoading ? (
              <div
                data-testid="translation-loading"
                aria-label={t('reader.translatingParagraph')}
                className="mt-1 flex h-5 items-center gap-1 pl-4"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-3)]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-3)] [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-3)] [animation-delay:240ms]" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
