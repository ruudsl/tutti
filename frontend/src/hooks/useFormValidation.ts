import { useCallback, useRef } from 'react';
import { useAriaLive } from '../components/AriaLiveRegion';

interface ValidationError {
  field: string;
  message: string;
}

interface UseFormValidationOptions {
  /** Announce errors to screen readers */
  announceErrors?: boolean;
  /** Scroll to the first error */
  scrollToError?: boolean;
}

/**
 * Hook for accessible form validation with focus management.
 *
 * When validation errors occur, this hook will:
 * 1. Focus the first field with an error
 * 2. Announce the error to screen readers via ARIA live regions
 * 3. Optionally scroll to bring the error into view
 *
 * @example
 * ```tsx
 * function MyForm() {
 *   const { focusFirstError, setFieldError, clearErrors, errors } = useFormValidation();
 *
 *   const handleSubmit = (e) => {
 *     e.preventDefault();
 *     clearErrors();
 *
 *     const validationErrors = validateForm(formData);
 *     if (validationErrors.length > 0) {
 *       focusFirstError(validationErrors);
 *       return;
 *     }
 *
 *     // Submit form...
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input
 *         name="email"
 *         aria-invalid={!!errors.email}
 *         aria-describedby={errors.email ? 'email-error' : undefined}
 *       />
 *       {errors.email && <span id="email-error" className="form-error">{errors.email}</span>}
 *     </form>
 *   );
 * }
 * ```
 */
export function useFormValidation(options: UseFormValidationOptions = {}) {
  const { announceErrors = true, scrollToError = true } = options;
  const { announce } = useAriaLive();
  const errorsRef = useRef<Record<string, string>>({});

  /**
   * Focus the first field with a validation error.
   * Also announces the error(s) to screen readers.
   */
  const focusFirstError = useCallback(
    (errors: ValidationError[]) => {
      if (errors.length === 0) return;

      // Update errors ref
      const errorMap: Record<string, string> = {};
      errors.forEach(({ field, message }) => {
        errorMap[field] = message;
      });
      errorsRef.current = errorMap;

      // Find and focus the first error field
      const firstError = errors[0];
      const element = document.querySelector<HTMLElement>(
        `[name="${firstError.field}"], #${firstError.field}, [data-field="${firstError.field}"]`,
      );

      if (element) {
        // Set aria-invalid on the element
        element.setAttribute('aria-invalid', 'true');
        element.classList.add('has-error');

        // Focus the element
        element.focus({ preventScroll: !scrollToError });

        // Scroll into view if needed
        if (scrollToError) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      // Announce errors to screen readers
      if (announceErrors) {
        const errorCount = errors.length;
        const announcement =
          errorCount === 1
            ? `Validatiefout: ${firstError.message}`
            : `${errorCount} validatiefouten gevonden. Eerste fout: ${firstError.message}`;
        announce(announcement, 'assertive');
      }
    },
    [announce, announceErrors, scrollToError],
  );

  /**
   * Set error state for a specific field.
   */
  const setFieldError = useCallback((field: string, message: string) => {
    errorsRef.current = { ...errorsRef.current, [field]: message };

    const element = document.querySelector<HTMLElement>(`[name="${field}"], #${field}, [data-field="${field}"]`);

    if (element) {
      element.setAttribute('aria-invalid', 'true');
      element.classList.add('has-error');
    }
  }, []);

  /**
   * Clear error state for a specific field or all fields.
   */
  const clearErrors = useCallback((field?: string) => {
    if (field) {
      delete errorsRef.current[field];
      const element = document.querySelector<HTMLElement>(`[name="${field}"], #${field}, [data-field="${field}"]`);
      if (element) {
        element.removeAttribute('aria-invalid');
        element.classList.remove('has-error');
      }
    } else {
      // Clear all errors
      Object.keys(errorsRef.current).forEach((f) => {
        const element = document.querySelector<HTMLElement>(`[name="${f}"], #${f}, [data-field="${f}"]`);
        if (element) {
          element.removeAttribute('aria-invalid');
          element.classList.remove('has-error');
        }
      });
      errorsRef.current = {};
    }
  }, []);

  /**
   * Check if a field has an error.
   */
  const hasError = useCallback((field: string) => {
    return !!errorsRef.current[field];
  }, []);

  /**
   * Get the error message for a field.
   */
  const getError = useCallback((field: string) => {
    return errorsRef.current[field];
  }, []);

  return {
    focusFirstError,
    setFieldError,
    clearErrors,
    hasError,
    getError,
    errors: errorsRef.current,
  };
}

export default useFormValidation;
