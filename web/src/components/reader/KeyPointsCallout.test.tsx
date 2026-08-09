import { render, screen } from '@testing-library/react';
import { KeyPointsCallout } from './KeyPointsCallout';

test('KeyPointsCallout renders a structured lead and semantic points', () => {
  render(<KeyPointsCallout text={'XREADER_SUMMARY_V1\nLEAD: Main idea\nPOINT: First\nPOINT: Second'} locale="en" />);
  expect(screen.getByText('Main idea')).toBeInTheDocument();
  expect(screen.getByText('First')).toBeInTheDocument();
  expect(screen.getByText('Second')).toBeInTheDocument();
  expect(screen.getByRole('list')).toBeInTheDocument();
});

test('KeyPointsCallout renders historical sentences as paragraphs, not list items', () => {
  render(<KeyPointsCallout text="First sentence. Second sentence." locale="en" />);
  expect(screen.getByText('First sentence.')).toBeInTheDocument();
  expect(screen.getByText('Second sentence.')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

test('KeyPointsCallout renders explicit legacy bullets as clean list items', () => {
  render(<KeyPointsCallout text={'• First point.  \n• Second point.  \n• Third point.'} locale="en" />);

  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'First point.',
    'Second point.',
    'Third point.',
  ]);
  expect(screen.queryByText(/^•/)).not.toBeInTheDocument();
});

test('KeyPointsCallout renders plain text when no sentence boundary exists', () => {
  render(<KeyPointsCallout text="single summary" locale="en" />);
  expect(screen.getByText('single summary')).toBeInTheDocument();
});
