import toast, { Toaster } from 'react-hot-toast';

export { toast, Toaster };

/**
 * Show success toast
 */
export function showSuccess(message: string): void {
  toast.success(message);
}

/**
 * Show error toast
 */
export function showError(message: string): void {
  toast.error(message);
}

/**
 * Show loading toast that can be updated
 */
export function showLoading(message: string): string {
  return toast.loading(message);
}

/**
 * Dismiss a specific toast
 */
export function dismissToast(toastId: string): void {
  toast.dismiss(toastId);
}

/**
 * Show promise toast (loading -> success/error)
 */
export function showPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string | ((err: unknown) => string);
  }
): Promise<T> {
  return toast.promise(promise, messages);
}
