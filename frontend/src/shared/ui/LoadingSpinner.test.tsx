import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<LoadingSpinner label="Connecting to API..." />);
    expect(screen.getByText('Connecting to API...')).toBeInTheDocument();
  });
});
