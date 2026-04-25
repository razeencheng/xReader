'use client';

import { useMemo, useState } from 'react';
import { Languages } from 'lucide-react';
import { useLazyTranslation } from '@/hooks/useLazyTranslation';
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
  const [translationState, setTranslationState] = useState<{ key: string; open: Set<number> }>({
    key: resetKey,
    open: new Set(),
  });

  const openTranslations = translationState.key === resetKey ? translationState.open : new Set<number>();

  const { translations, observeRef } = useLazyTranslation({
    articleId,
    paragraphTexts: paragraphs,
    enabled: !sameLanguage,
  });

  const toggleTranslation = (index: number) => {
    setTranslationState((previous) => {
      const next = previous.key === resetKey ? new Set(previous.open) : new Set<number>();
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return { key: resetKey, open: next };
    });
  };

  return (
    <div className="reader-content">
      {paragraphs.map((paragraph, index) => {
        const isCode = /<pre|<code/i.test(paragraph);
        const blockTag = primaryTagFromHtml(paragraph);
        const translation = translations.get(index);
        const isOpen = openTranslations.has(index);
        const isLoading = isOpen && !translation;

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
            ref={observeRef(index)}
            data-block-tag={blockTag}
            data-layer="original"
            data-paragraph-index={index}
            style={{ fontFamily: originalFont }}
          >
            <div dangerouslySetInnerHTML={{ __html: paragraph }} />

            {!sameLanguage ? (
              <div className="mt-2">
                {isOpen ? (
                  <div className="mb-2 border-l-2 border-[var(--accent)] pl-4 text-[0.92em] italic leading-[1.8] text-[var(--text-2)]">
                    {translation ? (
                      translation
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[11.5px] not-italic text-[var(--text-3)]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                        {t('reader.translatingParagraph')}
                      </span>
                    )}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => toggleTranslation(index)}
                  className={`inline-flex items-center gap-1.5 border-none bg-transparent p-0 text-[11.5px] transition-colors ${
                    isOpen ? 'text-[var(--accent)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                  }`}
                >
                  <Languages size={12} />
                  {isLoading ? t('reader.translatingParagraph') : isOpen ? t('reader.hideTranslation') : t('reader.translateParagraph')}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
