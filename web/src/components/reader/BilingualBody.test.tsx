import { act, render, screen } from '@testing-library/react';

const sse = vi.hoisted(() => {
  type ClientRecord = {
    url: string;
    paragraphHandler: ((paragraph: { index: number; translation: string }) => void) | null;
    doneHandler: (() => void) | null;
    close: ReturnType<typeof vi.fn>;
  };

  const clients: ClientRecord[] = [];
  const createSSEClient = vi.fn((url: string) => {
    const client: ClientRecord = {
      url,
      paragraphHandler: null,
      doneHandler: null,
      close: vi.fn(),
    };
    clients.push(client);
    return {
      onParagraph: (callback: NonNullable<ClientRecord['paragraphHandler']>) => {
        client.paragraphHandler = callback;
      },
      onDone: (callback: NonNullable<ClientRecord['doneHandler']>) => {
        client.doneHandler = callback;
      },
      onError: vi.fn(),
      close: client.close,
    };
  });

  return {
    createSSEClient,
    get clients() {
      return clients;
    },
    pushParagraph: (clientIndex: number, paragraph: { index: number; translation: string }) => {
      clients[clientIndex]?.paragraphHandler?.(paragraph);
    },
    pushDone: (clientIndex: number) => clients[clientIndex]?.doneHandler?.(),
    reset: () => {
      clients.splice(0, clients.length);
      createSSEClient.mockClear();
    },
  };
});

vi.mock('@/lib/sse-client', () => ({
  createSSEClient: sse.createSSEClient,
}));

import { BilingualBody } from './BilingualBody';
import { useUIStore } from '@/stores/useUIStore';

const contentHtml = '<p>First paragraph</p><p>Second paragraph</p>';
let intersectionCallback:
  | ((entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting' | 'target'>>) => void)
  | null = null;

class FakeIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: typeof intersectionCallback) {
    intersectionCallback = callback;
  }
}

beforeEach(() => {
  sse.reset();
  intersectionCallback = null;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  useUIStore.setState({ nativeLanguage: 'zh-CN' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function enterParagraph(container: HTMLElement, index: number) {
  const target = container.querySelector(`[data-observe-index="${index}"]`);
  expect(target).toBeInTheDocument();
  act(() => {
    intersectionCallback?.([{ isIntersecting: true, target: target as Element }]);
  });
}

test('renders original paragraphs without translation controls in same-language mode', () => {
  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="zh-CN" nativeLanguage="zh" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /翻译段落/i })).not.toBeInTheDocument();
  expect(sse.createSSEClient).not.toHaveBeenCalled();
});

test('opens an SSE stream for the visible paragraph range and renders translations as they arrive', () => {
  const { container } = render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="en" nativeLanguage="zh-CN" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(sse.createSSEClient).not.toHaveBeenCalled();

  enterParagraph(container, 0);

  expect(sse.createSSEClient).toHaveBeenCalledWith('/api/articles/1/body-translation?start=0&count=2');
  expect(screen.queryByRole('button', { name: /翻译段落/i })).not.toBeInTheDocument();
  expect(screen.getAllByTestId('translation-loading')).toHaveLength(1);

  act(() => {
    sse.pushParagraph(0, { index: 0, translation: '第一段翻译' });
  });
  expect(screen.getByText('第一段翻译')).toBeInTheDocument();
  expect(screen.queryByTestId('translation-loading')).not.toBeInTheDocument();

  act(() => {
    sse.pushParagraph(0, { index: 1, translation: '第二段翻译' });
  });
  expect(screen.getByText('第二段翻译')).toBeInTheDocument();
  expect(screen.queryByTestId('translation-loading')).not.toBeInTheDocument();
});

test('renders translated paragraphs without decorative left rule', () => {
  const { container } = render(
    <BilingualBody articleId={1} contentHtml="<p>Hello world</p>" language="en" nativeLanguage="zh-CN" />,
  );

  enterParagraph(container, 0);
  act(() => {
    sse.pushParagraph(0, { index: 0, translation: '你好，世界' });
  });

  const translation = screen.getByText('你好，世界');
  expect(translation).toHaveAttribute('data-layer', 'translation');
  expect(translation.className).not.toContain('border-l');
  expect(translation.className).not.toContain('pl-4');
});

test('does not render loading placeholders for prefetched paragraphs', () => {
  const longContent = Array.from({ length: 6 }, (_, index) => `<p>Paragraph ${index}</p>`).join('');
  const { container } = render(
    <BilingualBody articleId={1} contentHtml={longContent} language="en" nativeLanguage="zh-CN" />,
  );

  enterParagraph(container, 1);

  expect(sse.createSSEClient).toHaveBeenCalledWith('/api/articles/1/body-translation?start=1&count=5');
  expect(screen.getAllByTestId('translation-loading')).toHaveLength(1);
  const loadingParent = screen.getByTestId('translation-loading').closest('[data-observe-index]');
  expect(loadingParent).toHaveAttribute('data-observe-index', '1');
});

test('prefetches the current paragraph and the following four paragraphs', () => {
  const longContent = Array.from({ length: 6 }, (_, index) => `<p>Paragraph ${index}</p>`).join('');
  const { container } = render(
    <BilingualBody articleId={1} contentHtml={longContent} language="en" nativeLanguage="zh-CN" />,
  );

  enterParagraph(container, 2);

  expect(sse.createSSEClient).toHaveBeenCalledWith('/api/articles/1/body-translation?start=2&count=4');
});

test('proxies external reader images and reserves their aspect ratio', () => {
  const { container } = render(
    <BilingualBody
      articleId={1}
      contentHtml='<p>如下图：<img width="640" height="417" src="https://st.deepzz.cn/blog/img/single-open-double-charged.jpg" alt="single-open-double-charged"/></p>'
      language="zh-CN"
      nativeLanguage="zh"
    />,
  );

  const image = container.querySelector('img');
  expect(image).toBeInTheDocument();
  expect(image?.getAttribute('src')).toBe(
    '/api/images/proxy?url=https%3A%2F%2Fst.deepzz.cn%2Fblog%2Fimg%2Fsingle-open-double-charged.jpg',
  );
  expect(image?.getAttribute('data-original-src')).toBe('https://st.deepzz.cn/blog/img/single-open-double-charged.jpg');
  expect(image?.getAttribute('style')).toContain('aspect-ratio: 640 / 417');
  expect(image?.getAttribute('style')).toContain('max-width: 640px');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('decoding', 'async');
});

test('marks semantic article blocks so the reader stylesheet can preserve hierarchy', () => {
  const { container } = render(
    <BilingualBody
      articleId={1}
      contentHtml="<details><summary>目录</summary><ul><li>第一节</li></ul></details><h3>章节标题</h3><p>正文段落</p>"
      language="zh-CN"
      nativeLanguage="zh"
    />,
  );

  expect(container.querySelector('.reader-content')).toBeInTheDocument();
  expect(container.querySelector('[data-block-tag="details"] details')).toBeInTheDocument();
  expect(container.querySelector('[data-block-tag="h3"] h3')).toHaveTextContent('章节标题');
  expect(container.querySelector('[data-block-tag="p"] p')).toHaveTextContent('正文段落');
});

test('keeps paragraphs with inline code in normal text flow', () => {
  const { container } = render(
    <BilingualBody
      articleId={1}
      contentHtml="<p>老习惯，最后贴一下全部的配置。<code>.gitlab-ci.yml</code>。加了一个<code>resource_group</code>。</p><pre><code>image: docker:latest</code></pre>"
      language="zh-CN"
      nativeLanguage="zh"
    />,
  );

  const paragraphBlock = container.querySelector('[data-block-tag="p"]');
  expect(paragraphBlock).toHaveClass('paragraph-container');
  expect(paragraphBlock).toHaveTextContent('老习惯，最后贴一下全部的配置。');
  expect(paragraphBlock).not.toHaveClass('font-mono');
  expect(container.querySelector('[data-block-tag="pre"]')).toHaveClass('font-mono');
});

test('removes hidden heading anchors from sanitized article html', () => {
  render(
    <BilingualBody
      articleId={1}
      contentHtml='<h3>详细配置<a hidden class="anchor" aria-hidden="true" href="#详细配置">#</a></h3><h3>总结#</h3>'
      language="zh-CN"
      nativeLanguage="zh"
    />,
  );

  expect(screen.getByRole('heading', { name: '详细配置' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '总结' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '详细配置#' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '总结#' })).not.toBeInTheDocument();
});

test('stabilizes external images without dimensions and suppresses filename-like fallback alt text', () => {
  const { container } = render(
    <BilingualBody
      articleId={1}
      contentHtml='<p><img src="https://st.razeen.me/img/2025/image-20250412165248283.webp" alt="image-20250412165248283"/></p>'
      language="zh-CN"
      nativeLanguage="zh"
    />,
  );

  const image = container.querySelector('img');
  expect(image).toBeInTheDocument();
  expect(image?.getAttribute('src')).toBe(
    '/api/images/proxy?url=https%3A%2F%2Fst.razeen.me%2Fimg%2F2025%2Fimage-20250412165248283.webp',
  );
  expect(image).toHaveAttribute('data-original-alt', 'image-20250412165248283');
  expect(image).toHaveAttribute('alt', '');
  expect(image?.getAttribute('style')).toContain('aspect-ratio: 16 / 9');
  expect(image?.getAttribute('style')).toContain('min-height: 12rem');
});
