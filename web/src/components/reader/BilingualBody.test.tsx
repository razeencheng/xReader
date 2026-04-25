import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useLazyTranslation = vi.fn();

vi.mock('@/hooks/useLazyTranslation', () => ({
  useLazyTranslation: (...args: unknown[]) => useLazyTranslation(...args),
}));

import { BilingualBody } from './BilingualBody';
import { useUIStore } from '@/stores/useUIStore';

const contentHtml = '<p>First paragraph</p><p>Second paragraph</p>';

beforeEach(() => {
  useLazyTranslation.mockReset();
  useUIStore.setState({ nativeLanguage: 'zh-CN' });
});

test('renders original paragraphs without translation controls in same-language mode', () => {
  useLazyTranslation.mockReturnValue({
    translations: new Map(),
    observeRef: () => () => undefined,
  });

  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="zh-CN" nativeLanguage="zh" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /翻译段落/i })).not.toBeInTheDocument();
});

test('toggles paragraph translation from a dedicated button', async () => {
  useLazyTranslation.mockReturnValue({
    translations: new Map([[0, '第一段翻译']]),
    observeRef: () => () => undefined,
  });

  const user = userEvent.setup();
  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="en" nativeLanguage="zh-CN" />,
  );

  const buttons = screen.getAllByRole('button', { name: /翻译段落/i });
  expect(buttons).toHaveLength(2);

  await user.click(buttons[0]);
  expect(screen.getByText('第一段翻译')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /隐藏翻译/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /隐藏翻译/i }));
  expect(screen.queryByText('第一段翻译')).not.toBeInTheDocument();
});

test('marks semantic article blocks so the reader stylesheet can preserve hierarchy', () => {
  useLazyTranslation.mockReturnValue({
    translations: new Map(),
    observeRef: () => () => undefined,
  });

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
