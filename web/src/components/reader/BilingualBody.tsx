'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSSEClient, type SSEParagraphEvent } from '@/lib/sse-client';
import { fontForLang } from '@/lib/langFonts';

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

const ORIGINAL_COLOR = '#6a6252';
const TRANSLATION_COLOR = '#1f1f1f';

function normalizeLanguage(language: string) {
  return language.toLowerCase().split('-')[0];
}

function isSameLanguage(articleLanguage: string, nativeLanguage: string) {
  return normalizeLanguage(articleLanguage) === normalizeLanguage(nativeLanguage);
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitContentHtml(contentHtml: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${contentHtml}</body>`, 'text/html');
  const paragraphs: string[] = [];

  const pushText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      paragraphs.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  };

  const pushNode = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (WRAPPER_TAGS.has(tag)) {
      Array.from(element.childNodes).forEach(pushNode);
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      paragraphs.push(element.outerHTML);
      return;
    }

    paragraphs.push(`<p>${element.outerHTML}</p>`);
  };

  Array.from(document.body.childNodes).forEach(pushNode);
  return paragraphs;
}

function LoadingPulse() {
  return (
    <div className="mt-2 flex gap-1.5 pb-4">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4d0c8]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4d0c8] [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4d0c8] [animation-delay:300ms]" />
    </div>
  );
}

export function BilingualBody({ articleId, contentHtml, language, nativeLanguage }: Props) {
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [isDone, setIsDone] = useState(false);

  const paragraphs = useMemo(() => splitContentHtml(contentHtml), [contentHtml]);
  const sameLanguage = isSameLanguage(language, nativeLanguage);
  const originalFont = fontForLang(language);
  const translationFont = fontForLang(nativeLanguage);

  useEffect(() => {
    setTranslations(new Map());
    setIsDone(sameLanguage || paragraphs.length === 0);

    if (sameLanguage || paragraphs.length === 0) {
      return;
    }

    const client = createSSEClient(`/api/articles/${articleId}/body-translation`);

    client.onParagraph((paragraph: SSEParagraphEvent) => {
      setTranslations((current) => {
        const next = new Map(current);
        next.set(paragraph.index, paragraph.translation);
        return next;
      });
    });

    client.onDone(() => {
      setIsDone(true);
      client.close();
    });

    client.onError(() => {
      // Let the SSE wrapper retry once. Keep the loading indicator visible
      // until the stream finishes or translations continue to arrive.
    });

    return () => {
      client.close();
    };
  }, [articleId, paragraphs.length, sameLanguage]);

  return (
    <div className="text-[18px] leading-[1.8]">
      {paragraphs.map((paragraph, index) => {
        const translation = translations.get(index);
        const paragraphProps = {
          'data-paragraph-index': index,
          'data-highlight-source': encodeURIComponent(paragraph),
        };

        return (
          <div key={index} className="pb-4" {...paragraphProps}>
            <div
              data-layer="original"
              className="text-[#6a6252]"
              style={{ fontFamily: originalFont }}
              dangerouslySetInnerHTML={{ __html: paragraph }}
            />
            {!sameLanguage ? (
              translation ? (
                <div
                  data-layer="translation"
                  className="mt-2 text-[#1f1f1f]"
                  style={{ fontFamily: translationFont }}
                >
                  {translation}
                </div>
              ) : !isDone ? (
                <LoadingPulse />
              ) : null
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
