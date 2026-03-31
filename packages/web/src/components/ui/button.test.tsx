// Unit test for the Button component.
// Verifies it renders children correctly and honours the disabled prop.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its children as accessible button text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('is disabled when the disabled prop is passed', () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('applies a custom className alongside variant styles', () => {
    render(<Button className="my-custom-class">Styled</Button>);
    const btn = screen.getByRole('button', { name: 'Styled' });
    expect(btn).toHaveClass('my-custom-class');
  });
});
