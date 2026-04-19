import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import Page from './page';

test('home page renders app title', () => {
  render(<Page />);
  expect(screen.getByText(/xReader/i)).toBeInTheDocument();
});
