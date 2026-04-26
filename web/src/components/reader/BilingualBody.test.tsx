import { act, render, screen } from '@testing-library/react';

const sse = vi.hoisted(() => {
  let paragraphHandler: ((paragraph: { index: number; translation: string }) => void) | null = null;
  let doneHandler: (() => void) | null = null;
  const close = vi.fn();
  const createSSEClient = vi.fn(() => ({
    onParagraph: (callback: typeof paragraphHandler) => {
      paragraphHandler = callback;
    },
    onDone: (callback: typeof doneHandler) => {
      doneHandler = callback;
    },
    onError: vi.fn(),
    close,
  }));

  return {
    createSSEClient,
    close,
    pushParagraph: (paragraph: { index: number; translation: string }) => paragraphHandler?.(paragraph),
    pushDone: () => doneHandler?.(),
    reset: () => {
      paragraphHandler = null;
      doneHandler = null;
      close.mockReset();
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

beforeEach(() => {
  sse.reset();
  useUIStore.setState({ nativeLanguage: 'zh-CN' });
});

test('renders original paragraphs without translation controls in same-language mode', () => {
  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="zh-CN" nativeLanguage="zh" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /翻译段落/i })).not.toBeInTheDocument();
  expect(sse.createSSEClient).not.toHaveBeenCalled();
});

test('opens an SSE stream and renders translations automatically as paragraphs arrive', () => {
  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="en" nativeLanguage="zh-CN" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(sse.createSSEClient).toHaveBeenCalledWith('/api/articles/1/body-translation');
  expect(screen.queryByRole('button', { name: /翻译段落/i })).not.toBeInTheDocument();
  expect(screen.getByTestId('translation-loading')).toBeInTheDocument();

  act(() => {
    sse.pushParagraph({ index: 0, translation: '第一段翻译' });
  });
  expect(screen.getByText('第一段翻译')).toBeInTheDocument();
  expect(screen.getByTestId('translation-loading')).toBeInTheDocument();

  act(() => {
    sse.pushParagraph({ index: 1, translation: '第二段翻译' });
  });
  expect(screen.getByText('第二段翻译')).toBeInTheDocument();
  expect(screen.queryByTestId('translation-loading')).not.toBeInTheDocument();
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
