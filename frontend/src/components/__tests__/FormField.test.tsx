import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField } from '../FormField';

describe('FormField', () => {
  it('renders the label and the child control', () => {
    render(
      <FormField label="E-mailadres">
        <input type="email" />
      </FormField>,
    );

    expect(screen.getByText('E-mailadres')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mailadres')).toBeInTheDocument();
  });

  it('links the label to the control via htmlFor/id', () => {
    render(
      <FormField label="Naam">
        <input type="text" />
      </FormField>,
    );

    const input = screen.getByLabelText('Naam');
    const label = screen.getByText('Naam');

    expect(input).toHaveAttribute('id');
    expect(label).toHaveAttribute('for', input.getAttribute('id'));
  });

  it('respects an explicit id on the child control', () => {
    render(
      <FormField label="Telefoon">
        <input type="tel" id="my-phone-field" />
      </FormField>,
    );

    const input = screen.getByLabelText('Telefoon');
    expect(input).toHaveAttribute('id', 'my-phone-field');
    expect(screen.getByText('Telefoon')).toHaveAttribute('for', 'my-phone-field');
  });

  it('focuses the control when the label is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Opmerking">
        <input type="text" />
      </FormField>,
    );

    await user.click(screen.getByText('Opmerking'));
    expect(screen.getByLabelText('Opmerking')).toHaveFocus();
  });

  it('applies default and custom wrapper/label classes', () => {
    const { container, rerender } = render(
      <FormField label="Veld">
        <input />
      </FormField>,
    );

    expect(container.querySelector('.form-group')).toBeInTheDocument();
    expect(container.querySelector('label.form-label')).toBeInTheDocument();

    rerender(
      <FormField label="Veld" className="custom-group" labelClassName="custom-label">
        <input />
      </FormField>,
    );

    expect(container.querySelector('.custom-group')).toBeInTheDocument();
    expect(container.querySelector('label.custom-label')).toBeInTheDocument();
  });

  it('works with select elements too', () => {
    render(
      <FormField label="Rol">
        <select>
          <option value="member">Lid</option>
        </select>
      </FormField>,
    );

    expect(screen.getByLabelText('Rol').tagName).toBe('SELECT');
  });
});
