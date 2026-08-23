/**
 * Vooruit laden bij het aanwijzen van een link.
 *
 * De haak belooft twee dingen die je op het scherm niet ziet: dat er pas na een
 * wachttijd geladen wordt (anders laadt elke muisbeweging over een lijst tien
 * pagina's op), en dat er per link maar één keer geladen wordt. Beide gaan stuk
 * zonder dat er iets aan de pagina verandert - de gebruiker ziet hooguit dat
 * het toestel warm wordt.
 *
 * Wat hier vastligt:
 *
 *   - aanwijzen laadt niet meteen, maar na de wachttijd
 *   - wegbewegen binnen de wachttijd laadt helemaal niet
 *   - toetsenbordnadruk laadt wél meteen: die komt niet per ongeluk langs
 *   - klikken laadt en navigeert, ook als de wachttijd nog liep
 *   - `navigate: false` houdt de haak volledig stil, ook de standaardactie van
 *     de link blijft dan staan
 *
 * De losse variant `getPrefetchLinkProps` wordt apart getoetst: die houdt zijn
 * staat in gewone variabelen in plaats van in refs, en wijkt op één punt af van
 * de haak. Dat verschil staat onderaan met een toelichting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { usePrefetch, getPrefetchLinkProps } from '../usePrefetch';

const navigeer = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigeer }));

/** Een klikgebeurtenis met alleen het stukje dat de haak aanraakt. */
function klik() {
  const gebeurtenis = { preventDefault: vi.fn() };
  return gebeurtenis as unknown as ReactMouseEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePrefetch - aanwijzen', () => {
  it('laadt niet meteen bij het aanwijzen', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());

    // De hele reden voor de wachttijd: een muis die over een lijst glijdt raakt
    // tien links aan zonder dat de gebruiker er één wil.
    expect(laden).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(99));
    expect(laden).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('houdt zich aan een zelf opgegeven wachttijd', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden, { delay: 500 }));

    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));
    expect(laden).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('laadt niet als de muis binnen de wachttijd weer weg is', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(50));
    act(() => result.current.onMouseLeave());
    act(() => vi.advanceTimersByTime(1000));

    expect(laden).not.toHaveBeenCalled();
  });

  it('laadt per link maar één keer, hoe vaak je hem ook aanwijst', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));

    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('doet niets bij wegbewegen zonder lopende wachttijd', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    expect(() => act(() => result.current.onMouseLeave())).not.toThrow();
    act(() => vi.advanceTimersByTime(1000));
    expect(laden).not.toHaveBeenCalled();
  });
});

describe('usePrefetch - toetsenbord', () => {
  it('laadt meteen bij nadruk, zonder wachttijd', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onFocus());

    // Nadruk krijgt een link alleen doordat iemand er met de tab-toets naartoe
    // gaat. Dat is geen toevallige aanraking, dus wachten heeft geen zin.
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('laadt niet opnieuw als er al geladen is', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onFocus());
    act(() => result.current.onFocus());
    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));

    expect(laden).toHaveBeenCalledTimes(1);
  });

  // BEWIJS, dezelfde fout als bij klikken: nadruk laadde meteen maar liet de
  // wachttijd van het aanwijzen doorlopen. Rood op de oude code, met twee
  // aanroepen.
  it('zet een lopende wachttijd stop in plaats van er nog eens overheen te laden', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    act(() => result.current.onFocus());
    act(() => vi.advanceTimersByTime(100));

    expect(laden).toHaveBeenCalledTimes(1);
  });
});

describe('usePrefetch - opruimen', () => {
  // BEWIJS: de wachttijd werd bij het opruimen niet gestopt. Wie een link
  // aanwees en meteen doorklikte naar een andere pagina, liet de teller
  // doorlopen en haalde daarna gegevens op voor een link die niet meer bestaat.
  // Rood op de oude code.
  it('laadt niet meer nadat de link verdwenen is', () => {
    const laden = vi.fn();
    const { result, unmount } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    unmount();
    act(() => vi.advanceTimersByTime(1000));

    expect(laden).not.toHaveBeenCalled();
  });
});

describe('usePrefetch - klikken', () => {
  it('houdt de standaardactie tegen, laadt meteen en navigeert', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));
    const gebeurtenis = klik();

    act(() => result.current.onClick(gebeurtenis));

    // Zonder preventDefault volgt de browser de href en gooit de hele app weg.
    expect(gebeurtenis.preventDefault).toHaveBeenCalledTimes(1);
    expect(laden).toHaveBeenCalledTimes(1);
    expect(navigeer).toHaveBeenCalledWith('/muziek/1');
  });

  /**
   * BEWIJS - hier zat een echte fout; deze test is rood op de oude code.
   *
   * `onMouseLeave` zette een lopende wachttijd stop, maar `onClick` en
   * `onFocus` niet. Die laadden meteen en zetten de vlag om, waarna de teller
   * van het aanwijzen gewoon doortikte. De callback in `setTimeout` kijkt niet
   * naar die vlag - hij zet hem zelf - dus er werd een tweede keer geladen,
   * zonder dat iets dat tegenhield.
   *
   * Het geval is niet exotisch: een link aanwijzen en er binnen 100 ms op
   * klikken is hoe iemand met een muis een link aanklikt. Op de oude code komt
   * `laden` hier op twee uit.
   */
  it('laadt bij klikken zonder op de wachttijd te wachten, en daarna niet nog een keer', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    act(() => result.current.onClick(klik()));

    // De wachttijd loopt nog; wie klikt wil niet nog eens 100 ms wachten.
    expect(laden).toHaveBeenCalledTimes(1);

    // En als de wachttijd daarna alsnog afloopt, laadt hij niet nog een keer.
    act(() => vi.advanceTimersByTime(100));
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('laadt niet opnieuw als het aanwijzen het al gedaan had', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    act(() => result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.onClick(klik()));

    expect(laden).toHaveBeenCalledTimes(1);
    expect(navigeer).toHaveBeenCalledWith('/muziek/1');
  });

  it('blijft volledig stil met navigate: false', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden, { navigate: false }));
    const gebeurtenis = klik();

    act(() => result.current.onClick(gebeurtenis));

    // Hier hoort de link zijn eigen gang te gaan: geen preventDefault, geen
    // navigatie via de router, en ook geen laadverzoek.
    expect(gebeurtenis.preventDefault).not.toHaveBeenCalled();
    expect(navigeer).not.toHaveBeenCalled();
    expect(laden).not.toHaveBeenCalled();
  });
});

describe('usePrefetch - de gebundelde handlers', () => {
  it('bevat dezelfde functies als de losse velden', () => {
    const laden = vi.fn();
    const { result } = renderHook(() => usePrefetch('/muziek/1', laden));

    // prefetchHandlers is bedoeld om als geheel op een <a> te spreiden; het mag
    // niet uit andere functies bestaan dan de losse velden.
    expect(result.current.prefetchHandlers.onMouseEnter).toBe(result.current.onMouseEnter);
    expect(result.current.prefetchHandlers.onMouseLeave).toBe(result.current.onMouseLeave);
    expect(result.current.prefetchHandlers.onClick).toBe(result.current.onClick);
    expect(result.current.prefetchHandlers.onFocus).toBe(result.current.onFocus);
  });
});

describe('getPrefetchLinkProps - dezelfde afspraak zonder haak', () => {
  it('zet de href op het opgegeven pad', () => {
    const props = getPrefetchLinkProps('/muziek/1', vi.fn(), vi.fn());
    expect(props.href).toBe('/muziek/1');
  });

  it('wacht bij aanwijzen en laadt daarna één keer', () => {
    const laden = vi.fn();
    const props = getPrefetchLinkProps('/muziek/1', laden, vi.fn());

    props.onMouseEnter();
    expect(laden).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(laden).toHaveBeenCalledTimes(1);

    props.onMouseEnter();
    vi.advanceTimersByTime(100);
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('laadt niet als de muis binnen de wachttijd weg is', () => {
    const laden = vi.fn();
    const props = getPrefetchLinkProps('/muziek/1', laden, vi.fn(), { delay: 200 });

    props.onMouseEnter();
    vi.advanceTimersByTime(100);
    props.onMouseLeave();
    vi.advanceTimersByTime(1000);

    expect(laden).not.toHaveBeenCalled();
  });

  it('houdt de standaardactie tegen, laadt en navigeert bij klikken', () => {
    const laden = vi.fn();
    const navigatie = vi.fn();
    const props = getPrefetchLinkProps('/muziek/1', laden, navigatie);
    const gebeurtenis = klik();

    props.onClick(gebeurtenis);

    expect(gebeurtenis.preventDefault).toHaveBeenCalledTimes(1);
    expect(laden).toHaveBeenCalledTimes(1);
    expect(navigatie).toHaveBeenCalledWith('/muziek/1');
  });

  it('WACHT: onthoudt na een klik niet dat er al geladen is', () => {
    const laden = vi.fn();
    const props = getPrefetchLinkProps('/muziek/1', laden, vi.fn());

    props.onClick(klik());
    props.onMouseEnter();
    vi.advanceTimersByTime(100);

    // Dit is de huidige werking, niet de gewenste. usePrefetch zet in dezelfde
    // situatie zijn vlag wél om ("Trigger prefetch immediately if not already
    // done"), en laadt daarna niet nog eens. Deze variant slaat de vlag over,
    // dus wie na een klik terugkeert en de link opnieuw aanwijst, haalt hetzelfde
    // nog een keer op.
    //
    // Het is geen gebroken scherm en de kosten zijn één verzoek, dus het blijft
    // hier staan als vastgelegde stand: verandert iemand het, dan valt deze test
    // om en is het een keuze in plaats van een ongelukje. Het is een wacht, geen
    // bewijs - hij is groen op de code zoals die nu is.
    expect(laden).toHaveBeenCalledTimes(2);
  });
});
