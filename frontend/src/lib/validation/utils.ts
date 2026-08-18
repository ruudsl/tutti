import { z } from 'zod';
import type { TFunction } from 'i18next';

/**
 * Creates a Zod error map that uses i18n translations
 * Compatible with Zod v4
 *
 * @param t - The i18n translation function
 * @returns A Zod error map function
 *
 * @example
 * ```tsx
 * const { t } = useTranslation();
 * const errorMap = createI18nErrorMap(t);
 * // Use with zodResolver: zodResolver(schema, { error: errorMap })
 * ```
 */
export function createI18nErrorMap(t: TFunction): z.core.$ZodErrorMap {
  return (issue) => {
    let message: string;

    switch (issue.code) {
      case 'invalid_type':
        if (issue.input === undefined || issue.input === null) {
          message = t('errors.required', 'This field is required');
        } else {
          message = t('errors.invalidType', 'Invalid type');
        }
        break;

      case 'too_small':
        if (issue.origin === 'string') {
          if (issue.minimum === 1) {
            message = t('errors.required', 'This field is required');
          } else {
            message = t('errors.minLength', {
              min: issue.minimum,
              defaultValue: `Minimum ${issue.minimum} characters required`,
            });
          }
        } else if (issue.origin === 'number') {
          message = t('errors.minValue', {
            min: issue.minimum,
            defaultValue: `Value must be at least ${issue.minimum}`,
          });
        } else if (issue.origin === 'array') {
          message = t('errors.minItems', {
            min: issue.minimum,
            defaultValue: `At least ${issue.minimum} items required`,
          });
        } else {
          message = issue.message || 'Value is too small';
        }
        break;

      case 'too_big':
        if (issue.origin === 'string') {
          message = t('errors.maxLength', {
            max: issue.maximum,
            defaultValue: `Maximum ${issue.maximum} characters allowed`,
          });
        } else if (issue.origin === 'number') {
          message = t('errors.maxValue', {
            max: issue.maximum,
            defaultValue: `Value must be at most ${issue.maximum}`,
          });
        } else if (issue.origin === 'array') {
          message = t('errors.maxItems', {
            max: issue.maximum,
            defaultValue: `Maximum ${issue.maximum} items allowed`,
          });
        } else {
          message = issue.message || 'Value is too large';
        }
        break;

      case 'invalid_format':
        if (issue.format === 'email') {
          message = t('errors.invalidEmail', 'Please enter a valid email address');
        } else if (issue.format === 'url') {
          message = t('errors.invalidUrl', 'Please enter a valid URL');
        } else if (issue.format === 'uuid') {
          message = t('errors.invalidUuid', 'Please enter a valid ID');
        } else if (issue.format === 'datetime') {
          message = t('errors.invalidDate', 'Please enter a valid date');
        } else if (issue.format === 'regex') {
          message = t('errors.invalidFormat', 'Invalid format');
        } else {
          message = issue.message || 'Invalid format';
        }
        break;

      case 'invalid_value':
        message = t('errors.invalidSelection', 'Please select a valid option');
        break;

      case 'custom':
        // Custom errors should have their message set in the schema
        // Try to translate if it looks like a translation key
        if (issue.message?.startsWith('errors.')) {
          message = t(issue.message, issue.message);
        } else {
          message = issue.message || 'Validation failed';
        }
        break;

      default:
        message = issue.message || 'Validation failed';
    }

    return message;
  };
}

/**
 * Validates a single field value against a schema
 *
 * @param schema - The Zod schema to validate against
 * @param value - The value to validate
 * @param t - Optional i18n translation function
 * @returns The validation error message, or undefined if valid
 */
export function validateField<T extends z.ZodType>(schema: T, value: unknown, t?: TFunction): string | undefined {
  const errorMap = t ? createI18nErrorMap(t) : undefined;
  const result = schema.safeParse(value, errorMap ? { error: errorMap } : undefined);

  if (result.success) {
    return undefined;
  }

  return result.error?.issues[0]?.message;
}
