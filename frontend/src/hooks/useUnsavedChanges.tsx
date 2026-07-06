import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../components/ConfirmDialog';

export interface UnsavedChangesResult {
  /**
   * Call instead of closing directly. Runs `proceed` immediately when the
   * form is not dirty; otherwise shows a confirmation dialog and only runs
   * `proceed` when the user chooses to discard their changes.
   */
  confirmClose: (proceed: () => void) => void;
  /** Render this somewhere in the component tree (shows the ConfirmDialog when needed). */
  dialog: ReactNode;
}

/**
 * Guards against silently losing form input.
 *
 * The app uses a plain <BrowserRouter> (no data router), so react-router's
 * useBlocker is unavailable. Instead this hook provides:
 * - a `beforeunload` listener while dirty (browser-native warning on tab
 *   close / refresh / hard navigation), and
 * - a `confirmClose(proceed)` helper that shows a ConfirmDialog before
 *   closing a modal/form that has unsaved changes.
 *
 * @param isDirty whether the guarded form currently has unsaved changes
 */
export function useUnsavedChanges(isDirty: boolean): UnsavedChangesResult {
  const { t } = useTranslation();
  const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Browser-native warning when closing the tab / refreshing while dirty.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by some browsers to actually show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmClose = useCallback((proceed: () => void) => {
    if (isDirtyRef.current) {
      setPendingProceed(() => proceed);
    } else {
      proceed();
    }
  }, []);

  const dialog: ReactNode = pendingProceed ? (
    <ConfirmDialog
      title={t('common.unsavedChanges.title')}
      message={t('common.unsavedChanges.message')}
      confirmLabel={t('common.unsavedChanges.discard')}
      cancelLabel={t('common.unsavedChanges.keepEditing')}
      variant="warning"
      onConfirm={() => {
        setPendingProceed(null);
        pendingProceed();
      }}
      onCancel={() => setPendingProceed(null)}
    />
  ) : null;

  return { confirmClose, dialog };
}

export default useUnsavedChanges;
