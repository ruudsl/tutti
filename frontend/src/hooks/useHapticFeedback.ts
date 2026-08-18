/**
 * Haptic feedback utility for mobile devices.
 * Uses the Vibration API when available.
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10],
  warning: [30, 50, 30],
  error: [50, 100, 50, 100, 50],
  selection: 5,
};

/**
 * Check if haptic feedback is supported on this device
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback with a predefined pattern
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): boolean {
  if (!isHapticSupported()) return false;

  try {
    const vibrationPattern = PATTERNS[pattern];
    return navigator.vibrate(vibrationPattern);
  } catch {
    return false;
  }
}

/**
 * Trigger custom haptic feedback with a specific duration or pattern
 */
export function triggerCustomHaptic(pattern: number | number[]): boolean {
  if (!isHapticSupported()) return false;

  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * Cancel any ongoing haptic feedback
 */
export function cancelHaptic(): boolean {
  if (!isHapticSupported()) return false;

  try {
    return navigator.vibrate(0);
  } catch {
    return false;
  }
}

/**
 * React hook for haptic feedback
 */
export function useHapticFeedback() {
  const isSupported = isHapticSupported();

  const haptic = (pattern: HapticPattern = 'light') => {
    if (isSupported) {
      triggerHaptic(pattern);
    }
  };

  const hapticOnClick = <T extends HTMLElement>(pattern: HapticPattern = 'light') => {
    return (_e: React.MouseEvent<T> | React.TouchEvent<T>) => {
      haptic(pattern);
    };
  };

  return {
    isSupported,
    haptic,
    hapticOnClick,
    triggerHaptic,
    triggerCustomHaptic,
    cancelHaptic,
  };
}

export default useHapticFeedback;
