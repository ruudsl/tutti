import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError, showLoading, dismissToast } from '../utils/toast';
import { getLocalizedErrorMessage } from '../utils/errors';

/**
 * Options for the useAsyncAction hook
 */
export interface AsyncActionOptions<TResult> {
  /** Success message or function to generate message */
  successMessage?: string | ((result: TResult) => string);
  /** Error message or function to generate message (overrides default) */
  errorMessage?: string | ((error: unknown) => string);
  /** Loading message (shows toast while loading) */
  loadingMessage?: string;
  /** Callback on success */
  onSuccess?: (result: TResult) => void;
  /** Callback on error */
  onError?: (error: unknown) => void;
  /** Whether to show toast notifications (default: true) */
  showToast?: boolean;
  /** Whether to reset error state on new execution (default: true) */
  resetErrorOnExecute?: boolean;
}

/**
 * Return type of useAsyncAction hook
 */
export interface AsyncActionState<TResult> {
  /** Whether the action is currently loading */
  isLoading: boolean;
  /** The error from the last execution, if any */
  error: unknown | null;
  /** The error message from the last execution, if any */
  errorMessage: string | null;
  /** The result from the last successful execution */
  result: TResult | null;
  /** Reset the state */
  reset: () => void;
}

/**
 * A custom hook that wraps async operations with loading state, error handling,
 * and optional toast notifications.
 *
 * @example
 * ```tsx
 * const [deleteUser, { isLoading, error }] = useAsyncAction(
 *   async (userId: string) => {
 *     await api.delete(`/users/${userId}`);
 *   },
 *   {
 *     successMessage: 'User deleted successfully',
 *     onSuccess: () => refetch(),
 *   }
 * );
 *
 * // In component
 * <button onClick={() => deleteUser(user.id)} disabled={isLoading}>
 *   Delete
 * </button>
 * ```
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: AsyncActionOptions<TResult> = {},
): [(...args: TArgs) => Promise<TResult | undefined>, AsyncActionState<TResult>] {
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const {
    successMessage,
    errorMessage: customErrorMessage,
    loadingMessage,
    onSuccess,
    onError,
    showToast = true,
    resetErrorOnExecute = true,
  } = options;

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (resetErrorOnExecute) {
        setError(null);
        setErrorMessage(null);
      }

      setIsLoading(true);
      let loadingToastId: string | undefined;

      if (showToast && loadingMessage) {
        loadingToastId = showLoading(loadingMessage);
      }

      try {
        const res = await action(...args);
        setResult(res);
        setError(null);
        setErrorMessage(null);

        if (loadingToastId) {
          dismissToast(loadingToastId);
        }

        if (showToast && successMessage) {
          const message = typeof successMessage === 'function' ? successMessage(res) : successMessage;
          showSuccess(message);
        }

        onSuccess?.(res);
        return res;
      } catch (err) {
        setError(err);

        // Get localized error message
        const message = customErrorMessage
          ? typeof customErrorMessage === 'function'
            ? customErrorMessage(err)
            : customErrorMessage
          : getLocalizedErrorMessage(err, t, i18n.language);

        setErrorMessage(message);

        if (loadingToastId) {
          dismissToast(loadingToastId);
        }

        if (showToast) {
          showError(message);
        }

        onError?.(err);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [
      action,
      successMessage,
      customErrorMessage,
      loadingMessage,
      onSuccess,
      onError,
      showToast,
      resetErrorOnExecute,
      t,
      i18n.language,
    ],
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setErrorMessage(null);
    setResult(null);
  }, []);

  return [
    execute,
    {
      isLoading,
      error,
      errorMessage,
      result,
      reset,
    },
  ];
}

/**
 * A simplified version that returns just the execute function and loading state.
 * Useful for simple mutations.
 *
 * @example
 * ```tsx
 * const [save, saving] = useSimpleAsyncAction(
 *   () => api.put('/settings', data),
 *   { successMessage: 'Settings saved' }
 * );
 * ```
 */
export function useSimpleAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: Omit<AsyncActionOptions<TResult>, 'resetErrorOnExecute'> = {},
): [(...args: TArgs) => Promise<TResult | undefined>, boolean] {
  const [execute, { isLoading }] = useAsyncAction(action, options);
  return [execute, isLoading];
}

export default useAsyncAction;
