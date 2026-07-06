import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../components/ConfirmDialog';

export interface ConfirmOptions {
  /** Dialog heading. Defaults to a generic "Confirm" title. */
  title?: string;
  /** Body text or node. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

/**
 * Imperative confirm: resolves to true when the user confirms, false when they
 * cancel/dismiss. Pass a string as shorthand for `{ message }`.
 */
export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Provides an app-wide imperative confirmation dialog, so call sites can do
 * `if (await confirm(t('x.confirmDelete'))) { ... }` instead of the native
 * `window.confirm`, without each page wiring its own dialog state/JSX.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts;
    setOptions(normalized);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          title={options.title ?? t('common.confirm')}
          message={options.message}
          confirmLabel={options.confirmLabel}
          cancelLabel={options.cancelLabel}
          variant={options.variant ?? 'danger'}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Access the imperative confirm function. Must be used within ConfirmProvider.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
