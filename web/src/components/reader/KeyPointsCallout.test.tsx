import { render, screen } from '@testing-library/react';
import { KeyPointsCallout } from './KeyPointsCallout';

test('KeyPointsCallout renders summary text', () => {
  render(<KeyPointsCallout text="① aaa ② bbb ③ ccc" />);
  expect(screen.getByText(/aaa/)).toBeInTheDocument();
  expect(screen.getByText('要点')).toBeInTheDocument();
});

test('KeyPointsCallout renders nothing when text is empty', () => {
  const { container } = render(<KeyPointsCallout text="" />);
  expect(container.firstChild).toBeNull();
});
