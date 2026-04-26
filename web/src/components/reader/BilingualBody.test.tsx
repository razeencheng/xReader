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
