import { render, screen } from '@testing-library/react';
import { BilingualBody } from './BilingualBody';

const createSSEClient = vi.fn();

vi.mock('@/lib/sse-client', () => ({
  createSSEClient: (...args: unknown[]) => createSSEClient(...args),
}));

const contentHtml = '<p>First paragraph</p><p>Second paragraph</p>';

afterEach(() => {
  createSSEClient.mockReset();
});

test('renders original content when same language without SSE connection', () => {
  render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="zh-CN" nativeLanguage="zh" />,
  );

  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  expect(createSSEClient).not.toHaveBeenCalled();
});

test('renders paragraphs with data-paragraph-index attributes', () => {
  createSSEClient.mockReturnValue({
    onParagraph: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    close: vi.fn(),
  });

  const { container } = render(
    <BilingualBody articleId={1} contentHtml={contentHtml} language="ja" nativeLanguage="zh-CN" />,
  );

  const paragraphs = container.querySelectorAll('[data-paragraph-index]');

  expect(paragraphs).toHaveLength(2);
  expect(screen.getByText('First paragraph')).toBeInTheDocument();
  expect(screen.getByText('Second paragraph')).toBeInTheDocument();
});
