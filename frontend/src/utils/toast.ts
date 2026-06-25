/**
 * Toast Notification Utilities Module
 *
 * Provides accessible toast notifications with screen reader support.
 * Wraps react-hot-toast with automatic ARIA announcements.
 *
 * @module utils/toast
 */

import toast, { Toaster } from 'react-hot-toast';

export { toast, Toaster };

/**
 * Announces a message to screen readers via ARIA live region.
 *
 * @description Creates a temporary DOM element with ARIA attributes to announce
 * messages to assistive technologies. The element is automatically removed after
 * the announcement is read.
 * @param {string} message - Message to announce
 * @param {'polite' | 'assertive'} [priority='polite'] - Announcement priority
 * @private
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
 * Shows a success toast with screen reader announcement.
 *
 * @description Displays a success toast notification and announces the message
 * to screen readers with polite priority.
 * @param {string} message - Success message to display
 * @example
 * showSuccess('Changes saved successfully');
 */
export function showSuccess(message: string): void {
  toast.success(message);
  announceToScreenReader(message, 'polite');
}

/**
 * Shows an error toast with screen reader announcement.
 *
 * @description Displays an error toast notification and announces the message
 * to screen readers with assertive priority (immediate interruption).
 * @param {string} message - Error message to display
 * @example
 * showError('Failed to save changes');
 */
export function showError(message: string): void {
  toast.error(message);
  announceToScreenReader(message, 'assertive');
}

/**
 * Shows a loading toast that can be updated or dismissed.
 *
 * @description Displays a loading toast and announces the message to screen readers.
 * Returns a toast ID that can be used to dismiss or update the toast.
 * @param {string} message - Loading message to display
 * @returns {string} Toast ID for updating or dismissing
 * @example
 * const toastId = showLoading('Saving changes...');
 * // Later...
 * dismissToast(toastId);
 * showSuccess('Changes saved!');
 */
export function showLoading(message: string): string {
  announceToScreenReader(message, 'polite');
  return toast.loading(message);
}

/**
 * Dismisses a specific toast by ID.
 *
 * @description Removes a toast from the screen using its ID.
 * @param {string} toastId - ID of the toast to dismiss
 * @example
 * const toastId = showLoading('Loading...');
 * // When done:
 * dismissToast(toastId);
 */
export function dismissToast(toastId: string): void {
  toast.dismiss(toastId);
}

/**
 * Shows a promise-based toast that transitions through loading, success, and error states.
 *
 * @description Displays a loading toast while the promise is pending, then transitions
 * to success or error based on the promise outcome. Includes screen reader announcements
 * for all state transitions.
 * @template T - Type of the promise result
 * @param {Promise<T>} promise - The promise to track
 * @param {Object} messages - Messages for each state
 * @param {string} messages.loading - Message shown while loading
 * @param {string} messages.success - Message shown on success
 * @param {string | ((err: unknown) => string)} messages.error - Error message or function to generate one
 * @returns {Promise<T>} The original promise result
 * @throws {unknown} Re-throws the original error if the promise rejects
 * @example
 * const user = await showPromise(
 *   saveUser(userData),
 *   {
 *     loading: 'Saving user...',
 *     success: 'User saved!',
 *     error: (err) => `Failed to save: ${getErrorMessage(err)}`
 *   }
 * );
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
