import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value
 * @param value The value to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook that returns a debounced callback function
 * @param callback The callback to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number = 300): T {
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  const debouncedCallback = ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    setTimer(
      setTimeout(() => {
        callback(...args);
      }, delay),
    );
  }) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timer]);

  return debouncedCallback;
}
