/**
 * Tests voor de trilfunctie.
 *
 * De Vibration API bestaat niet in jsdom, dus die wordt er hier op en af
 * gezet. Zo kunnen we toetsen dat er niets trilt (en vooral: niets klapt) op
 * een apparaat dat het niet kan, en dat elk trilpatroon de juiste reeks
 * doorgeeft.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isHapticSupported,
  triggerHaptic,
  triggerCustomHaptic,
  cancelHaptic,
  useHapticFeedback,
} from '../useHapticFeedback';

let trillen: ReturnType<typeof vi.fn>;

/** Doet alsof het apparaat kan trillen. */
function metTrilfunctie() {
  trillen = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, 'vibrate', { value: trillen, configurable: true, writable: true });
}

/** Doet alsof het apparaat niet kan trillen. */
function zonderTrilfunctie() {
  delete (navigator as unknown as Record<string, unknown>).vibrate;
}

beforeEach(() => {
  metTrilfunctie();
});

afterEach(() => {
  zonderTrilfunctie();
});

describe('isHapticSupported', () => {
  it('herkent een apparaat dat kan trillen', () => {
    expect(isHapticSupported()).toBe(true);
  });

  it('herkent een apparaat dat het niet kan', () => {
    zonderTrilfunctie();

    expect(isHapticSupported()).toBe(false);
  });
});

describe('triggerHaptic', () => {
  it('trilt standaard kort', () => {
    triggerHaptic();

    expect(trillen).toHaveBeenCalledWith(10);
  });

  it('kent voor elk patroon een eigen reeks', () => {
    const verwacht: Record<string, number | number[]> = {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [10, 50, 10],
      warning: [30, 50, 30],
      error: [50, 100, 50, 100, 50],
      selection: 5,
    };

    for (const [patroon, reeks] of Object.entries(verwacht)) {
      trillen.mockClear();
      triggerHaptic(patroon as Parameters<typeof triggerHaptic>[0]);
      expect(trillen, patroon).toHaveBeenCalledWith(reeks);
    }
  });

  it('doet niets op een apparaat zonder trilfunctie', () => {
    zonderTrilfunctie();

    expect(triggerHaptic('heavy')).toBe(false);
  });

  it('slikt een weigering van de browser in plaats van te klappen', () => {
    trillen.mockImplementation(() => {
      throw new Error('niet toegestaan');
    });

    expect(triggerHaptic('light')).toBe(false);
  });
});

describe('triggerCustomHaptic', () => {
  it('geeft een eigen reeks ongewijzigd door', () => {
    triggerCustomHaptic([100, 30, 100]);

    expect(trillen).toHaveBeenCalledWith([100, 30, 100]);
  });

  it('doet niets op een apparaat zonder trilfunctie', () => {
    zonderTrilfunctie();

    expect(triggerCustomHaptic(50)).toBe(false);
  });

  it('slikt een weigering van de browser', () => {
    trillen.mockImplementation(() => {
      throw new Error('niet toegestaan');
    });

    expect(triggerCustomHaptic(50)).toBe(false);
  });
});

describe('cancelHaptic', () => {
  it('zet het trillen stil', () => {
    cancelHaptic();

    expect(trillen).toHaveBeenCalledWith(0);
  });

  it('doet niets op een apparaat zonder trilfunctie', () => {
    zonderTrilfunctie();

    expect(cancelHaptic()).toBe(false);
  });
});

describe('useHapticFeedback', () => {
  it('meldt of het apparaat kan trillen', () => {
    const { result } = renderHook(() => useHapticFeedback());

    expect(result.current.isSupported).toBe(true);
  });

  it('trilt via haptic() met het gevraagde patroon', () => {
    const { result } = renderHook(() => useHapticFeedback());

    result.current.haptic('success');

    expect(trillen).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('geeft een klikafhandelaar die trilt', () => {
    const { result } = renderHook(() => useHapticFeedback());

    const opKlik = result.current.hapticOnClick('medium');
    opKlik({} as React.MouseEvent<HTMLElement>);

    expect(trillen).toHaveBeenCalledWith(25);
  });

  it('trilt niet wanneer het apparaat het niet kan', () => {
    zonderTrilfunctie();
    const { result } = renderHook(() => useHapticFeedback());

    expect(result.current.isSupported).toBe(false);
    expect(() => result.current.haptic('error')).not.toThrow();
  });
});
