/**
 * Tests voor de veeggebaren.
 *
 * De aanraakgebeurtenissen worden met de hand nagebootst, zodat we per gebaar
 * kunnen bepalen hoe ver en hoe snel er geveegd wordt. Naast de vier richtingen
 * kijken we of het scrollen wel of niet wordt tegengehouden en of de
 * luisteraars op het element weer verdwijnen zodra de hook opruimt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture, type SwipeCallbacks, type SwipeOptions } from '../useSwipeGesture';

/** Bouwt een aanraakgebeurtenis; jsdom kent zelf geen TouchEvent-constructor. */
function raakAan(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
  return event;
}

/** Zet de hook op met een echt element eraan gekoppeld. */
function opzetten(callbacks: SwipeCallbacks, options: SwipeOptions = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);

  const hook = renderHook(() => {
    const api = useSwipeGesture<HTMLDivElement>(callbacks, options);
    // React zet de ref voor de effecten draaien; dat doen we hier ook.
    api.ref.current = element;
    return api;
  });

  return { element, ...hook };
}

/** Voert een volledig gebaar uit: aanraken, bewegen, loslaten. */
function veeg(element: HTMLElement, van: [number, number], naar: [number, number], duurMs = 100) {
  act(() => {
    element.dispatchEvent(raakAan('touchstart', van[0], van[1]));
  });
  act(() => {
    vi.advanceTimersByTime(duurMs);
    element.dispatchEvent(raakAan('touchmove', naar[0], naar[1]));
  });
  act(() => {
    element.dispatchEvent(raakAan('touchend', naar[0], naar[1]));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSwipeGesture - richtingen', () => {
  it('herkent een veeg naar links', () => {
    const callbacks = { onSwipeLeft: vi.fn(), onSwipeRight: vi.fn() };
    const { element } = opzetten(callbacks);

    veeg(element, [200, 100], [100, 100]);

    expect(callbacks.onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(callbacks.onSwipeRight).not.toHaveBeenCalled();
  });

  it('herkent een veeg naar rechts', () => {
    const callbacks = { onSwipeRight: vi.fn() };
    const { element } = opzetten(callbacks);

    veeg(element, [100, 100], [200, 100]);

    expect(callbacks.onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('herkent een veeg omhoog', () => {
    const callbacks = { onSwipeUp: vi.fn() };
    const { element } = opzetten(callbacks);

    veeg(element, [100, 200], [100, 100]);

    expect(callbacks.onSwipeUp).toHaveBeenCalledTimes(1);
  });

  it('herkent een veeg omlaag', () => {
    const callbacks = { onSwipeDown: vi.fn() };
    const { element } = opzetten(callbacks);

    veeg(element, [100, 100], [100, 200]);

    expect(callbacks.onSwipeDown).toHaveBeenCalledTimes(1);
  });

  it('kiest de richting waarin het verst geveegd is', () => {
    const callbacks = { onSwipeLeft: vi.fn(), onSwipeDown: vi.fn() };
    const { element } = opzetten(callbacks);

    // 100 naar links, 60 omlaag: links wint.
    veeg(element, [200, 100], [100, 160]);

    expect(callbacks.onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(callbacks.onSwipeDown).not.toHaveBeenCalled();
  });
});

describe('useSwipeGesture - drempel en snelheid', () => {
  it('negeert een beweging die de drempel niet haalt', () => {
    const callbacks = { onSwipeLeft: vi.fn(), onSwipeEnd: vi.fn() };
    const { element } = opzetten(callbacks);

    veeg(element, [200, 100], [170, 100]);

    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith(false, null);
  });

  it('gebruikt een zelf ingestelde drempel', () => {
    const callbacks = { onSwipeLeft: vi.fn() };
    const { element } = opzetten(callbacks, { threshold: 20 });

    veeg(element, [200, 100], [170, 100]);

    expect(callbacks.onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('laat een traag gebaar met te weinig snelheid niet meetellen', () => {
    const callbacks = { onSwipeRight: vi.fn(), onSwipeEnd: vi.fn() };
    const { element } = opzetten(callbacks);

    // 200 pixels in 2 seconden is 0,1 px/ms: te traag en ruim over maxTime.
    veeg(element, [100, 100], [300, 100], 2000);

    expect(callbacks.onSwipeRight).not.toHaveBeenCalled();
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith(false, 'right');
  });

  it('laat een traag maar lang gebaar wel meetellen als de snelheid hoog genoeg is', () => {
    const callbacks = { onSwipeRight: vi.fn() };
    const { element } = opzetten(callbacks);

    // 400 pixels in 500 ms is 0,8 px/ms: over maxTime, maar snel genoeg.
    veeg(element, [100, 100], [500, 100], 500);

    expect(callbacks.onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('geeft de afgelegde afstand en de snelheid door tijdens het vegen', () => {
    const onSwipeMove = vi.fn();
    const { element } = opzetten({ onSwipeMove });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    act(() => {
      vi.advanceTimersByTime(100);
      element.dispatchEvent(raakAan('touchmove', 150, 120));
    });

    expect(onSwipeMove).toHaveBeenCalledTimes(1);
    const [deltaX, deltaY, snelheid] = onSwipeMove.mock.calls[0];
    expect(deltaX).toBe(50);
    expect(deltaY).toBe(20);
    expect(snelheid).toBeCloseTo(Math.sqrt(50 * 50 + 20 * 20) / 100, 5);
  });
});

describe('useSwipeGesture - begin en einde', () => {
  it('meldt de richting zodra er meer dan tien pixels bewogen is', () => {
    const onSwipeStart = vi.fn();
    const { element } = opzetten({ onSwipeStart });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    act(() => {
      vi.advanceTimersByTime(20);
      element.dispatchEvent(raakAan('touchmove', 105, 100));
    });
    expect(onSwipeStart).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(20);
      element.dispatchEvent(raakAan('touchmove', 130, 100));
    });

    expect(onSwipeStart).toHaveBeenCalledExactlyOnceWith('right');
  });

  it('meldt bij het loslaten of het gebaar geslaagd is en welke richting het was', () => {
    const onSwipeEnd = vi.fn();
    const { element } = opzetten({ onSwipeEnd });

    veeg(element, [200, 100], [100, 100]);

    expect(onSwipeEnd).toHaveBeenCalledWith(true, 'left');
  });

  it('meldt een afgebroken aanraking als mislukt gebaar', () => {
    const onSwipeEnd = vi.fn();
    const { element } = opzetten({ onSwipeEnd });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 200, 100));
    });
    act(() => {
      element.dispatchEvent(raakAan('touchcancel', 150, 100));
    });

    expect(onSwipeEnd).toHaveBeenCalledWith(false, null);
  });

  it('begint na een afgebroken aanraking met een schone lei', () => {
    const callbacks = { onSwipeLeft: vi.fn() };
    const { element } = opzetten(callbacks);

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 200, 100));
    });
    act(() => {
      element.dispatchEvent(raakAan('touchcancel', 200, 100));
    });
    // Losse touchmove en touchend zonder nieuwe touchstart tellen niet mee.
    act(() => {
      element.dispatchEvent(raakAan('touchmove', 50, 100));
      element.dispatchEvent(raakAan('touchend', 50, 100));
    });

    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
  });
});

describe('useSwipeGesture - scrollen tegenhouden', () => {
  it('houdt het scrollen tegen bij een horizontale veeg', () => {
    const { element } = opzetten({});

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    const beweging = raakAan('touchmove', 200, 100);
    act(() => {
      vi.advanceTimersByTime(50);
      element.dispatchEvent(beweging);
    });

    expect(beweging.defaultPrevented).toBe(true);
  });

  it('laat verticaal scrollen standaard gewoon door', () => {
    const { element } = opzetten({});

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    const beweging = raakAan('touchmove', 100, 200);
    act(() => {
      vi.advanceTimersByTime(50);
      element.dispatchEvent(beweging);
    });

    expect(beweging.defaultPrevented).toBe(false);
  });

  it('houdt horizontaal scrollen niet tegen wanneer dat is uitgezet', () => {
    const { element } = opzetten({}, { preventScrollOnHorizontalSwipe: false });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    const beweging = raakAan('touchmove', 200, 100);
    act(() => {
      vi.advanceTimersByTime(50);
      element.dispatchEvent(beweging);
    });

    expect(beweging.defaultPrevented).toBe(false);
  });

  it('houdt verticaal scrollen tegen wanneer daarom gevraagd wordt', () => {
    const { element } = opzetten({}, { preventScrollOnVerticalSwipe: true });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100, 100));
    });
    const beweging = raakAan('touchmove', 100, 200);
    act(() => {
      vi.advanceTimersByTime(50);
      element.dispatchEvent(beweging);
    });

    expect(beweging.defaultPrevented).toBe(true);
  });
});

describe('useSwipeGesture - uitgezet en opruimen', () => {
  it('doet niets wanneer de hook is uitgezet', () => {
    const callbacks = { onSwipeLeft: vi.fn(), onSwipeStart: vi.fn(), onSwipeMove: vi.fn(), onSwipeEnd: vi.fn() };
    const { element } = opzetten(callbacks, { disabled: true });

    veeg(element, [200, 100], [100, 100]);

    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
    expect(callbacks.onSwipeStart).not.toHaveBeenCalled();
    expect(callbacks.onSwipeMove).not.toHaveBeenCalled();
    expect(callbacks.onSwipeEnd).not.toHaveBeenCalled();
  });

  it('hangt alle vier de aanraakluisteraars aan het element', () => {
    const element = document.createElement('div');
    const toevoegen = vi.spyOn(element, 'addEventListener');

    renderHook(() => {
      const api = useSwipeGesture<HTMLDivElement>({});
      api.ref.current = element;
      return api;
    });

    const soorten = toevoegen.mock.calls.map(([naam]) => naam);
    expect(soorten).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    // touchmove moet actief zijn, anders kan het scrollen niet tegengehouden.
    const [, , opties] = toevoegen.mock.calls[1];
    expect(opties).toMatchObject({ passive: false });
  });

  it('haalt alle aanraakluisteraars weer weg bij het opruimen', () => {
    const element = document.createElement('div');
    const verwijderen = vi.spyOn(element, 'removeEventListener');

    const { unmount } = renderHook(() => {
      const api = useSwipeGesture<HTMLDivElement>({});
      api.ref.current = element;
      return api;
    });

    unmount();

    expect(verwijderen.mock.calls.map(([naam]) => naam)).toEqual([
      'touchstart',
      'touchmove',
      'touchend',
      'touchcancel',
    ]);
  });

  it('reageert niet meer op aanraken nadat de hook is opgeruimd', () => {
    const callbacks = { onSwipeLeft: vi.fn() };
    const { element, unmount } = opzetten(callbacks);

    unmount();
    veeg(element, [200, 100], [100, 100]);

    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
  });
});

describe('useSwipeGesture - bind()', () => {
  it('geeft handlers terug die dezelfde gebaren herkennen', () => {
    const callbacks = { onSwipeLeft: vi.fn(), onSwipeEnd: vi.fn() };
    const { result } = renderHook(() => useSwipeGesture<HTMLDivElement>(callbacks));

    const props = result.current.bind();
    act(() => {
      props.onTouchStart({ nativeEvent: raakAan('touchstart', 200, 100) } as never);
    });
    act(() => {
      vi.advanceTimersByTime(50);
      props.onTouchMove({ nativeEvent: raakAan('touchmove', 100, 100) } as never);
    });
    act(() => {
      props.onTouchEnd({ nativeEvent: raakAan('touchend', 100, 100) } as never);
    });

    expect(callbacks.onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith(true, 'left');
  });

  it('geeft dezelfde ref terug als de hook zelf', () => {
    const { result } = renderHook(() => useSwipeGesture<HTMLDivElement>({}));

    expect(result.current.bind().ref).toBe(result.current.ref);
  });
});
