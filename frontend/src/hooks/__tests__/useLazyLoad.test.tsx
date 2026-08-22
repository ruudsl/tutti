/**
 * Tests voor het uitgesteld laden.
 *
 * jsdom kent geen IntersectionObserver, dus die wordt hier nagebouwd. Daardoor
 * kunnen we precies bepalen wanneer een element in beeld komt en controleren
 * wat de hook dan doet: zichtbaar melden, stoppen met kijken, en bij het
 * opruimen de waarnemer netjes loskoppelen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, screen, act } from '@testing-library/react';
import { useLazyLoad, useLazyLoadMultiple } from '../useLazyLoad';

interface NepEntry {
  target: Element;
  isIntersecting: boolean;
}

class NepWaarnemer {
  static instanties: NepWaarnemer[] = [];
  bekeken = new Set<Element>();
  losgekoppeld = false;

  constructor(
    public callback: (entries: NepEntry[], observer: unknown) => void,
    public opties: IntersectionObserverInit,
  ) {
    NepWaarnemer.instanties.push(this);
  }

  observe(el: Element) {
    this.bekeken.add(el);
  }
  unobserve(el: Element) {
    this.bekeken.delete(el);
  }
  disconnect() {
    this.bekeken.clear();
    this.losgekoppeld = true;
  }

  /** Doet alsof het element in of uit beeld komt. */
  meld(el: Element, inBeeld: boolean) {
    act(() => {
      this.callback([{ target: el, isIntersecting: inBeeld }], this);
    });
  }
}

/** De laatst aangemaakte waarnemer. */
function laatste() {
  return NepWaarnemer.instanties[NepWaarnemer.instanties.length - 1];
}

beforeEach(() => {
  NepWaarnemer.instanties = [];
  vi.stubGlobal('IntersectionObserver', NepWaarnemer);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLazyLoad', () => {
  /** Zet de hook op met een element eraan gekoppeld. */
  function opzetten(opties?: Parameters<typeof useLazyLoad>[0]) {
    const element = document.createElement('div');
    const hook = renderHook(() => {
      const api = useLazyLoad(opties);
      (api.ref as { current: HTMLElement | null }).current = element;
      return api;
    });
    return { element, ...hook };
  }

  it('begint onzichtbaar', () => {
    const { result } = opzetten();

    expect(result.current.isVisible).toBe(false);
    expect(result.current.hasBeenVisible).toBe(false);
  });

  it('kijkt naar het element met de standaardmarge van honderd pixels', () => {
    const { element } = opzetten();

    expect(laatste().opties).toMatchObject({ rootMargin: '100px', threshold: 0 });
    expect(laatste().bekeken.has(element)).toBe(true);
  });

  it('neemt eigen marge en drempel over', () => {
    opzetten({ rootMargin: '20px', threshold: [0, 0.5] });

    expect(laatste().opties).toMatchObject({ rootMargin: '20px', threshold: [0, 0.5] });
  });

  it('wordt zichtbaar zodra het element in beeld komt', () => {
    const { result, element } = opzetten();

    laatste().meld(element, true);

    expect(result.current.isVisible).toBe(true);
    expect(result.current.hasBeenVisible).toBe(true);
  });

  it('stopt met kijken na de eerste keer in beeld', () => {
    const { element } = opzetten();
    const waarnemer = laatste();

    waarnemer.meld(element, true);

    expect(waarnemer.bekeken.has(element)).toBe(false);
  });

  it('blijft kijken en wordt weer onzichtbaar wanneer triggerOnce uit staat', () => {
    const { result, element } = opzetten({ triggerOnce: false });
    const waarnemer = laatste();

    waarnemer.meld(element, true);
    expect(result.current.isVisible).toBe(true);
    // De hook zet na de eerste keer een nieuwe waarnemer neer; die moet het
    // element opnieuw in de gaten houden, anders wordt het uit beeld raken
    // nooit meer opgemerkt.
    expect(laatste().bekeken.has(element)).toBe(true);

    laatste().meld(element, false);

    expect(result.current.isVisible).toBe(false);
    // Eenmaal gezien blijft gezien.
    expect(result.current.hasBeenVisible).toBe(true);
  });

  it('koppelt de waarnemer los bij het opruimen', () => {
    const { unmount } = opzetten();
    const waarnemer = laatste();

    unmount();

    expect(waarnemer.losgekoppeld).toBe(true);
  });

  it('maakt geen waarnemer aan zonder element', () => {
    renderHook(() => useLazyLoad());

    expect(NepWaarnemer.instanties).toHaveLength(0);
  });

  it('kijkt niet meer wanneer het element al zichtbaar begon', () => {
    opzetten({ initialVisible: true });

    expect(NepWaarnemer.instanties).toHaveLength(0);
  });

  it('toont alles meteen wanneer de browser geen IntersectionObserver heeft', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    // `in window` is de controle die de hook doet.
    delete (window as unknown as Record<string, unknown>).IntersectionObserver;

    const { result } = opzetten();

    expect(result.current.isVisible).toBe(true);
    expect(result.current.hasBeenVisible).toBe(true);
  });
});

describe('useLazyLoadMultiple', () => {
  /** Een lijstje dat de hook gebruikt zoals een scherm dat zou doen. */
  function Lijst({ aantal }: { aantal: number }) {
    const { getRef, visibilityStates } = useLazyLoadMultiple({ count: aantal });
    return (
      <ul>
        {Array.from({ length: aantal }, (_, i) => (
          <li key={i} ref={getRef(i)} data-testid={`item-${i}`}>
            {visibilityStates[i] ? 'geladen' : 'wacht'}
          </li>
        ))}
      </ul>
    );
  }

  it('begint met alle items onzichtbaar', () => {
    const { result } = renderHook(() => useLazyLoadMultiple({ count: 3 }));

    expect(result.current.visibilityStates).toEqual([false, false, false]);
  });

  it('laadt het item dat in beeld komt', () => {
    render(<Lijst aantal={3} />);
    const eerste = screen.getByTestId('item-0');

    laatste().meld(eerste, true);

    expect(screen.getByTestId('item-0')).toHaveTextContent('geladen');
    expect(screen.getByTestId('item-1')).toHaveTextContent('wacht');
  });

  it('laat de andere items met rust', () => {
    render(<Lijst aantal={3} />);

    laatste().meld(screen.getByTestId('item-2'), true);

    expect(screen.getByTestId('item-0')).toHaveTextContent('wacht');
    expect(screen.getByTestId('item-2')).toHaveTextContent('geladen');
  });

  it('stopt met kijken naar een item dat geladen is', () => {
    const { result } = renderHook(() => useLazyLoadMultiple({ count: 2 }));
    const element = document.createElement('div');
    act(() => {
      result.current.getRef(0)(element);
    });
    const waarnemer = laatste();

    waarnemer.meld(element, true);

    expect(result.current.visibilityStates).toEqual([true, false]);
    expect(waarnemer.bekeken.has(element)).toBe(false);
  });

  it('blijft kijken naar een geladen item wanneer triggerOnce uit staat', () => {
    const { result } = renderHook(() => useLazyLoadMultiple({ count: 1, triggerOnce: false }));
    const element = document.createElement('div');
    act(() => {
      result.current.getRef(0)(element);
    });
    const waarnemer = laatste();

    waarnemer.meld(element, true);
    expect(waarnemer.bekeken.has(element)).toBe(true);

    waarnemer.meld(element, false);

    expect(result.current.visibilityStates).toEqual([false]);
  });

  it('gebruikt een waarnemer voor de hele lijst', () => {
    render(<Lijst aantal={4} />);

    expect(NepWaarnemer.instanties).toHaveLength(1);
    expect(laatste().bekeken.size).toBe(4);
  });

  it('houdt de al geladen items vast wanneer de lijst langer wordt', () => {
    const { rerender } = render(<Lijst aantal={2} />);
    laatste().meld(screen.getByTestId('item-0'), true);

    rerender(<Lijst aantal={4} />);

    expect(screen.getByTestId('item-0')).toHaveTextContent('geladen');
    expect(screen.getByTestId('item-3')).toHaveTextContent('wacht');
  });

  it('koppelt de waarnemer los bij het opruimen', () => {
    const { unmount } = render(<Lijst aantal={2} />);
    const waarnemer = laatste();

    unmount();

    expect(waarnemer.losgekoppeld).toBe(true);
  });

  it('stopt met kijken naar een element dat uit de lijst verdwijnt', () => {
    const { result } = renderHook(() => useLazyLoadMultiple({ count: 1 }));
    const element = document.createElement('div');

    act(() => {
      result.current.getRef(0)(element);
    });
    expect(laatste().bekeken.has(element)).toBe(true);

    act(() => {
      result.current.getRef(0)(null);
    });

    expect(laatste().bekeken.has(element)).toBe(false);
  });

  it('toont alles meteen wanneer de browser geen IntersectionObserver heeft', () => {
    delete (window as unknown as Record<string, unknown>).IntersectionObserver;

    const { result } = renderHook(() => useLazyLoadMultiple({ count: 2 }));

    expect(result.current.visibilityStates).toEqual([true, true]);
  });
});
