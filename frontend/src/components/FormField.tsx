import { cloneElement, ReactElement, ReactNode, useId, CSSProperties } from 'react';

interface FormFieldProps {
  /** Label content (rendered inside the <label>) */
  label: ReactNode;
  /** The form control (input/select/textarea); it receives the generated id */
  children: ReactElement<{ id?: string }>;
  /** Class for the wrapper element (defaults to "form-group") */
  className?: string;
  /** Inline style for the wrapper element */
  style?: CSSProperties;
  /** Class for the label element (defaults to "form-label") */
  labelClassName?: string;
}

/**
 * Reusable, accessible form field wrapper.
 *
 * Generates a unique id via useId() and links the <label> to the child
 * control with htmlFor/id, so screen readers announce the label and
 * clicking the label focuses the control.
 *
 * Usage:
 *   <FormField label={t('some.label')}>
 *     <input className="form-control" ... />
 *   </FormField>
 */
export function FormField({
  label,
  children,
  className = 'form-group',
  style,
  labelClassName = 'form-label',
}: FormFieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;

  return (
    <div className={className} style={style}>
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

export default FormField;
