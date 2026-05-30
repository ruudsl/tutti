import toast, { Toaster } from 'react-hot-toast';

export { toast, Toaster };

/**
 * Announce a message to screen readers via ARIA live region.
 * Creates a temporary element that is announced and then removed.
 */
function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement is read
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Show success toast with screen reader announcement
 */
export function showSuccess(message: string): void {
  toast.success(message);
  announceToScreenReader(message, 'polite');
}

/**
 * Show error toast with screen reader announcement
 */
export function showError(message: string): void {
  toast.error(message);
  announceToScreenReader(message, 'assertive');
}

/**
 * Show loading toast that can be updated
 */
export function showLoading(message: string): string {
  announceToScreenReader(message, 'polite');
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
 * Includes screen reader announcements for all states
 */
export function showPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string | ((err: unknown) => string);
  }
): Promise<T> {
  announceToScreenReader(messages.loading, 'polite');

  return toast.promise(promise, messages).then(
    (result) => {
      announceToScreenReader(messages.success, 'polite');
      return result;
    },
    (error) => {
      const errorMessage = typeof messages.error === 'function'
        ? messages.error(error)
        : messages.error;
      announceToScreenReader(errorMessage, 'assertive');
      throw error;
    }
  );
}
