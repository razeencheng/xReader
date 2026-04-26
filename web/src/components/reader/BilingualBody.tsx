'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSSEClient } from '@/lib/sse-client';
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

function splitContentHtml(contentHtml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${contentHtml}</body>`, 'text/html');
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
  const resetKey = `${articleId}:${language}:${nativeLanguage}:${contentHtml}`;
  const [translationState, setTranslationState] = useState<{
    key: string;
    translations: Map<number, string>;
    isStreaming: boolean;
  }>({
    key: '',
    translations: new Map(),
    isStreaming: false,
  });

  const shouldTranslate = !sameLanguage && paragraphs.length > 0;
  const translations = translationState.key === resetKey ? translationState.translations : new Map<number, string>();
  const isStreaming = shouldTranslate && (translationState.key !== resetKey || translationState.isStreaming);
  const nextPendingIndex = isStreaming ? paragraphs.findIndex((_, index) => !translations.has(index)) : -1;

  useEffect(() => {
    if (!shouldTranslate) {
      return;
    }

    const client = createSSEClient(`/api/articles/${articleId}/body-translation`);
    client.onParagraph((paragraph) => {
      setTranslationState((previous) => {
        const next = previous.key === resetKey ? new Map(previous.translations) : new Map<number, string>();
        next.set(paragraph.index, paragraph.translation);
        return { key: resetKey, translations: next, isStreaming: true };
      });
    });
    client.onDone(() => {
      setTranslationState((previous) => ({
        key: resetKey,
        translations: previous.key === resetKey ? previous.translations : new Map(),
        isStreaming: false,
      }));
    });
    client.onError(() => {
      setTranslationState((previous) => ({
        key: resetKey,
        translations: previous.key === resetKey ? previous.translations : new Map(),
        isStreaming: false,
      }));
    });

    return () => {
      client.close();
    };
  }, [articleId, resetKey, shouldTranslate]);

  return (
    <div className="reader-content">
      {paragraphs.map((paragraph, index) => {
        const isCode = /<pre|<code/i.test(paragraph);
        const blockTag = primaryTagFromHtml(paragraph);
        const translation = translations.get(index);
        const isLoading = nextPendingIndex === index && !translation;

        if (isCode) {
          return (
            <div
              key={index}
              data-block-tag={blockTag}
              className="overflow-x-auto rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] p-4 font-mono text-[13.5px] leading-[1.6] text-[var(--text-primary)]"
              dangerouslySetInnerHTML={{ __html: paragraph }}
            />
          );
        }

        return (
          <div
            key={index}
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
                className="mt-2 mb-4 border-l-2 border-[var(--accent)] pl-4 text-[0.92em] leading-[1.8] text-[var(--text)]"
              >
                {translation}
              </div>
            ) : isLoading ? (
              <div
                data-testid="translation-loading"
                aria-label={t('reader.translatingParagraph')}
                className="mt-2 mb-4 flex h-5 items-center gap-1 pl-4"
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
