/**
 * Tests voor de sneltoetsen.
 *
 * Het gaat hier om wat er gebeurt als er echt een toets wordt ingedrukt: welke
 * actie er afgaat, wanneer een toetsaanslag juist genegeerd hoort te worden
 * (typen in een invoerveld), en of de luisteraar op `document` weer weggaat
 * zodra het scherm verdwijnt. Die laatste is belangrijk: een sneltoetsluisteraar
 * die blijft hangen laat een oud scherm meeluisteren met het nieuwe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const navigeer = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigeer,
}));

import {
  useKeyboardShortcuts,
  useKeyboardShortcutsState,
  useKeyboardShortcutsHelp,
  useShortcutEvent,
  addShortcutListener,
  type Shortcut,
} from '../useKeyboardShortcuts';

/** Stuurt een toetsaanslag naar het document, eventueel vanuit een element. */
function toets(key: string, opties: Partial<KeyboardEventInit> & { doel?: HTMLElement } = {}) {
  const { doel, ...init } = opties;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    (doel ?? document).dispatchEvent(event);
  });
  return event;
}

/** Zet de gedeelde hulpdialoog terug op dicht, want die staat op moduleniveau. */
function resetHulp() {
  const { result, unmount } = renderHook(() => useKeyboardShortcutsState());
  act(() => {
    result.current.closeHelp();
  });
  unmount();
}

beforeEach(() => {
  navigeer.mockClear();
  resetHulp();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useKeyboardShortcuts - losse sneltoetsen', () => {
  it('voert een Ctrl-sneltoets uit en houdt de standaardactie van de browser tegen', () => {
    const gezien: string[] = [];
    const stopLuisteren = addShortcutListener((event) => gezien.push(event));
    renderHook(() => useKeyboardShortcuts());

    const event = toets('k', { ctrlKey: true });

    expect(gezien).toContain('openSearch');
    expect(event.defaultPrevented).toBe(true);
    stopLuisteren();
  });

  it('accepteert Cmd (meta) als alternatief voor Ctrl', () => {
    const gezien: string[] = [];
    const stopLuisteren = addShortcutListener((event) => gezien.push(event));
    renderHook(() => useKeyboardShortcuts());

    toets('s', { metaKey: true });

    expect(gezien).toContain('save');
    stopLuisteren();
  });

  it('doet niets bij dezelfde toets zonder modifier', () => {
    const gezien: string[] = [];
    const stopLuisteren = addShortcutListener((event) => gezien.push(event));
    renderHook(() => useKeyboardShortcuts());

    toets('k');

    expect(gezien).toEqual([]);
    stopLuisteren();
  });

  it('navigeert bij Alt+H naar de startpagina', () => {
    renderHook(() => useKeyboardShortcuts());

    toets('h', { altKey: true });

    expect(navigeer).toHaveBeenCalledWith('/');
  });

  it('opent de hulpdialoog met het vraagteken, ook al wordt dat met Shift getypt', () => {
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    // Op vrijwel elk toetsenbord is '?' letterlijk Shift + '/'. De browser
    // meldt dan key '?' mét shiftKey true.
    toets('?', { shiftKey: true });

    expect(result.current.isHelpOpen).toBe(true);
  });

  it('opent de hulpdialoog ook via Shift + /', () => {
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    toets('/', { shiftKey: true });

    expect(result.current.isHelpOpen).toBe(true);
  });

  it('sluit de hulpdialoog met Escape en meldt dat aan de luisteraars', () => {
    const gezien: string[] = [];
    const stopLuisteren = addShortcutListener((event) => gezien.push(event));
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    act(() => {
      result.current.openHelp();
    });
    expect(result.current.isHelpOpen).toBe(true);

    toets('Escape');

    expect(result.current.isHelpOpen).toBe(false);
    expect(gezien).toContain('close');
    stopLuisteren();
  });

  it('voert een zelf toegevoegde sneltoets uit', () => {
    const actie = vi.fn();
    const extra: Shortcut[] = [{ key: 'b', ctrl: true, action: actie, description: 'test.eigen' }];
    renderHook(() => useKeyboardShortcuts(extra));

    toets('b', { ctrlKey: true });

    expect(actie).toHaveBeenCalledTimes(1);
  });

  it('zet de cursor in het zoekveld bij Ctrl+/', () => {
    const invoer = document.createElement('input');
    invoer.type = 'search';
    document.body.appendChild(invoer);
    renderHook(() => useKeyboardShortcuts());

    toets('/', { ctrlKey: true });

    expect(document.activeElement).toBe(invoer);
  });
});

describe('useKeyboardShortcuts - reeksen zoals G H', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('navigeert na de reeks G, H naar de startpagina', () => {
    renderHook(() => useKeyboardShortcuts());

    toets('g');
    expect(navigeer).not.toHaveBeenCalled();

    toets('h');
    expect(navigeer).toHaveBeenCalledWith('/');
  });

  it('toont de wachtende reekstoets in de gedeelde status', () => {
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    toets('g');

    expect(result.current.pendingSequence).toBe('G');
  });

  it('vergeet de wachtende reekstoets na een seconde', () => {
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    toets('g');
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.pendingSequence).toBe('G');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.pendingSequence).toBeNull();

    // Na het verlopen telt de tweede toets niet meer als reeks.
    toets('h');
    expect(navigeer).not.toHaveBeenCalled();
  });

  it('start geen reeks wanneer er een modifier bij wordt gehouden', () => {
    const { result } = renderHook(() => {
      useKeyboardShortcuts();
      return useKeyboardShortcutsState();
    });

    toets('g', { ctrlKey: true });

    expect(result.current.pendingSequence).toBeNull();
  });

  it('kiest per reeks de juiste route', () => {
    renderHook(() => useKeyboardShortcuts());

    toets('g');
    toets('c');

    expect(navigeer).toHaveBeenCalledWith('/concerts');
  });
});

describe('useKeyboardShortcuts - typen in een invoerveld', () => {
  it('negeert losse letters terwijl de gebruiker typt', () => {
    const invoer = document.createElement('input');
    document.body.appendChild(invoer);
    invoer.focus();
    renderHook(() => useKeyboardShortcuts());

    toets('h', { doel: invoer, altKey: true });

    expect(navigeer).not.toHaveBeenCalled();
  });

  it('laat Ctrl-sneltoetsen wel door vanuit een invoerveld', () => {
    const gezien: string[] = [];
    const stopLuisteren = addShortcutListener((event) => gezien.push(event));
    const invoer = document.createElement('input');
    document.body.appendChild(invoer);
    renderHook(() => useKeyboardShortcuts());

    toets('s', { doel: invoer, ctrlKey: true });

    expect(gezien).toContain('save');
    stopLuisteren();
  });

  it('haalt met Escape de cursor uit het invoerveld', () => {
    const invoer = document.createElement('input');
    document.body.appendChild(invoer);
    invoer.focus();
    expect(document.activeElement).toBe(invoer);
    renderHook(() => useKeyboardShortcuts());

    toets('Escape', { doel: invoer });

    expect(document.activeElement).not.toBe(invoer);
  });

  it('negeert ook typen in een tekstvlak', () => {
    const vlak = document.createElement('textarea');
    document.body.appendChild(vlak);
    renderHook(() => useKeyboardShortcuts());

    toets('g', { doel: vlak });
    toets('h', { doel: vlak });

    expect(navigeer).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts - opruimen', () => {
  it('haalt de toetsluisteraar van het document af bij het opruimen', () => {
    const toevoegen = vi.spyOn(document, 'addEventListener');
    const verwijderen = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyboardShortcuts());
    const geregistreerd = toevoegen.mock.calls.filter(([naam]) => naam === 'keydown');
    expect(geregistreerd).toHaveLength(1);

    unmount();

    const opgeruimd = verwijderen.mock.calls.filter(([naam]) => naam === 'keydown');
    expect(opgeruimd).toHaveLength(1);
    expect(opgeruimd[0][1]).toBe(geregistreerd[0][1]);

    toevoegen.mockRestore();
    verwijderen.mockRestore();
  });

  it('reageert niet meer op toetsen nadat het scherm weg is', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();

    toets('h', { altKey: true });

    expect(navigeer).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcutsState', () => {
  it('deelt de status tussen twee losse gebruikers van de hook', () => {
    const eerste = renderHook(() => useKeyboardShortcutsState());
    const tweede = renderHook(() => useKeyboardShortcutsState());

    act(() => {
      eerste.result.current.openHelp();
    });

    expect(tweede.result.current.isHelpOpen).toBe(true);

    act(() => {
      eerste.result.current.closeHelp();
    });
    eerste.unmount();
    tweede.unmount();
  });

  it('wisselt de hulpdialoog om met toggleHelp', () => {
    const { result } = renderHook(() => useKeyboardShortcutsState());

    act(() => {
      result.current.toggleHelp();
    });
    expect(result.current.isHelpOpen).toBe(true);

    act(() => {
      result.current.toggleHelp();
    });
    expect(result.current.isHelpOpen).toBe(false);
  });

  it('werkt een opgeruimde gebruiker niet meer bij', () => {
    const blijver = renderHook(() => useKeyboardShortcutsState());
    const vertrekker = renderHook(() => useKeyboardShortcutsState());
    vertrekker.unmount();

    // Zonder opruimen zou de listener van de vertrokken hook nog een setState
    // op een verdwenen component doen.
    act(() => {
      blijver.result.current.openHelp();
    });

    expect(blijver.result.current.isHelpOpen).toBe(true);
    act(() => {
      blijver.result.current.closeHelp();
    });
  });
});

describe('useShortcutEvent', () => {
  it('roept de callback aan bij het bijbehorende voorval', () => {
    const callback = vi.fn();
    renderHook(() => {
      useKeyboardShortcuts();
      useShortcutEvent('openSearch', callback);
    });

    toets('k', { ctrlKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('reageert niet op een ander voorval', () => {
    const callback = vi.fn();
    renderHook(() => {
      useKeyboardShortcuts();
      useShortcutEvent('newItem', callback);
    });

    toets('k', { ctrlKey: true });

    expect(callback).not.toHaveBeenCalled();
  });

  it('luistert niet meer na het opruimen', () => {
    const callback = vi.fn();
    const luisteraar = renderHook(() => useShortcutEvent('openSearch', callback));
    const zender = renderHook(() => useKeyboardShortcuts());

    luisteraar.unmount();
    toets('k', { ctrlKey: true });

    expect(callback).not.toHaveBeenCalled();
    zender.unmount();
  });
});

describe('useKeyboardShortcutsHelp', () => {
  it('groepeert de sneltoetsen per categorie', () => {
    const { result } = renderHook(() => useKeyboardShortcutsHelp());

    expect(Object.keys(result.current).sort()).toEqual(['actions', 'general', 'navigation']);
  });

  it('schrijft een reeks als losse toetsen en een modifier met een plus', () => {
    const { result } = renderHook(() => useKeyboardShortcutsHelp());

    const navigatie = result.current.navigation.map((s) => s.label);
    const acties = result.current.actions.map((s) => s.label);

    expect(navigatie).toContain('G H');
    expect(acties).toContain('Ctrl+K');
  });

  it('kort Escape af tot Esc', () => {
    const { result } = renderHook(() => useKeyboardShortcutsHelp());

    const algemeen = result.current.general.map((s) => s.label);
    expect(algemeen).toContain('Esc');
  });

  it('toont elke omschrijving maar een keer, ook al bestaat er ook een Alt-variant', () => {
    const { result } = renderHook(() => useKeyboardShortcutsHelp());

    const omschrijvingen = result.current.navigation.map((s) => s.description);
    expect(new Set(omschrijvingen).size).toBe(omschrijvingen.length);
  });
});
