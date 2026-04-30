import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { ArticleReader } from './ArticleReader';

vi.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    code: string;
    status: number;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError: MockApiError,
    apiFetch: vi.fn(),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

test('notifies the parent when the selected article no longer exists', async () => {
  const onNotFound = vi.fn();
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, 'UNKNOWN', 'article not found'));

  render(<ArticleReader id="149" onNotFound={onNotFound} />, { wrapper });

  await waitFor(() => {
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });
});
