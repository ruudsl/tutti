/**
 * Tests voor de meldingen rechtsboven in beeld.
 *
 * Twee dingen kunnen hier misgaan, en allebei merkt de gebruiker ze meteen:
 *
 *   - dezelfde melding komt er twee, drie of vijf keer onder elkaar te staan.
 *     Dat gebeurt bij dubbelklikken op opslaan, bij een formulier dat twee
 *     keer verstuurt, of bij een lijst die per rij dezelfde fout meldt. De
 *     stapel duwt de rest van het scherm weg en er staat geen extra informatie
 *     in.
 *   - de melding blijft staan. Elke melding hangt aan een timer; blijft er een
 *     hangen, dan blijft ook het onzichtbare tekstblok voor de schermlezer in
 *     de pagina staan en groeit de DOM bij elke handeling verder aan.
 *
 * De aankondiging voor schermlezers is een tweede, onzichtbaar spoor: een
 * `sr-only`-element met een aria-live-gebied. Wordt dat dubbel geplaatst, dan
 * onderbreekt de schermlezer de gebruiker twee keer met dezelfde zin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import toast from 'react-hot-toast';
import { Toaster, showSuccess, showError, showLoading, showUndoToast, dismissToast, showPromise } from '../toast';

// react-hot-toast vraagt bij het renderen naar matchMedia (voor "beweging
// beperken"); jsdom kent dat niet.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

/** Alle onzichtbare aankondigingen die nu in de pagina staan. */
const aankondigingen = () => [...document.body.querySelectorAll('.sr-only')];

beforeEach(() => {
  toast.remove();
  document.body.innerHTML = '';
});

afterEach(() => {
  toast.remove();
  vi.useRealTimers();
});

// =============================================================================
// Meldingen op het scherm
// =============================================================================

describe('meldingen op het scherm', () => {
  it('toont een gelukt-melding', async () => {
    render(createElement(Toaster));

    act(() => {
      showSuccess('Wijzigingen opgeslagen');
    });

    expect(await screen.findByText('Wijzigingen opgeslagen')).toBeInTheDocument();
  });

  it('zet dezelfde gelukt-melding niet twee keer neer', async () => {
    // Twee keer op opslaan klikken - of een formulier dat per ongeluk twee
    // keer verstuurt - hoort één melding op te leveren, niet een stapel.
    render(createElement(Toaster));

    act(() => {
      showSuccess('Wijzigingen opgeslagen');
      showSuccess('Wijzigingen opgeslagen');
      showSuccess('Wijzigingen opgeslagen');
    });

    await waitFor(() => expect(screen.getAllByText('Wijzigingen opgeslagen')).toHaveLength(1));
  });

  it('zet dezelfde foutmelding niet twee keer neer', async () => {
    // Een lijst die per rij dezelfde netwerkfout meldt, vult anders het hele
    // scherm met dezelfde zin.
    render(createElement(Toaster));

    act(() => {
      showError('Netwerkfout. Controleer je internetverbinding.');
      showError('Netwerkfout. Controleer je internetverbinding.');
    });

    await waitFor(() => expect(screen.getAllByText('Netwerkfout. Controleer je internetverbinding.')).toHaveLength(1));
  });

  it('houdt twee verschillende meldingen wél naast elkaar', async () => {
    render(createElement(Toaster));

    act(() => {
      showSuccess('Muziekstuk opgeslagen');
      showSuccess('Repetitie opgeslagen');
    });

    expect(await screen.findByText('Muziekstuk opgeslagen')).toBeInTheDocument();
    expect(await screen.findByText('Repetitie opgeslagen')).toBeInTheDocument();
  });

  it('houdt een gelukt- en een foutmelding met dezelfde tekst uit elkaar', async () => {
    render(createElement(Toaster));

    act(() => {
      showSuccess('Verwerkt');
      showError('Verwerkt');
    });

    await waitFor(() => expect(screen.getAllByText('Verwerkt')).toHaveLength(2));
  });

  it('haalt een melding weg als hij wordt weggeklikt', async () => {
    render(createElement(Toaster));
    let id = '';

    act(() => {
      id = showLoading('Bezig met opslaan...');
    });
    expect(await screen.findByText('Bezig met opslaan...')).toBeInTheDocument();

    act(() => {
      dismissToast(id);
    });

    await waitFor(() => expect(screen.queryByText('Bezig met opslaan...')).not.toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('geeft een laadmelding een eigen id terug', () => {
    // Zonder id is de melding niet meer weg te krijgen en blijft "Bezig met
    // opslaan..." staan nadat het opslaan allang klaar is.
    const eerste = showLoading('Bezig...');
    const tweede = showLoading('Bezig...');

    expect(eerste).toBeTruthy();
    expect(tweede).toBeTruthy();
    expect(eerste).not.toBe(tweede);
  });
});

// =============================================================================
// Ongedaan maken
// =============================================================================

describe('showUndoToast', () => {
  it('toont de tekst met een knop ernaast', async () => {
    render(createElement(Toaster));

    act(() => {
      showUndoToast('Muziekstuk verwijderd', 'Ongedaan maken', () => {});
    });

    expect(await screen.findByText('Muziekstuk verwijderd')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Ongedaan maken' })).toBeInTheDocument();
  });

  it('roept de terugdraaiactie aan en haalt de melding weg', async () => {
    const terugdraaien = vi.fn();
    render(createElement(Toaster));

    act(() => {
      showUndoToast('Muziekstuk verwijderd', 'Ongedaan maken', terugdraaien);
    });
    const knop = await screen.findByRole('button', { name: 'Ongedaan maken' });

    act(() => {
      knop.click();
    });

    expect(terugdraaien).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Muziekstuk verwijderd')).not.toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('stapelt twee verwijderingen met dezelfde tekst wél', async () => {
    // Hier mág niet ontdubbeld worden: bij twee verwijderde stukken hoort elke
    // melding zijn eigen terugdraaiactie. Vielen ze samen, dan is het eerste
    // stuk niet meer terug te halen en merkt de gebruiker dat pas als hij
    // erop klikt.
    const eersteTerug = vi.fn();
    const tweedeTerug = vi.fn();
    render(createElement(Toaster));

    act(() => {
      showUndoToast('Muziekstuk verwijderd', 'Ongedaan maken', eersteTerug);
      showUndoToast('Muziekstuk verwijderd', 'Ongedaan maken', tweedeTerug);
    });

    const knoppen = await screen.findAllByRole('button', { name: 'Ongedaan maken' });
    expect(knoppen).toHaveLength(2);

    act(() => {
      knoppen[0].click();
      knoppen[1].click();
    });

    expect(eersteTerug).toHaveBeenCalledTimes(1);
    expect(tweedeTerug).toHaveBeenCalledTimes(1);
  });

  it('vangt een terugdraaiactie op die een belofte teruggeeft', async () => {
    // De aanroeper geeft vaak een async functie mee (een herstel-endpoint).
    // Die belofte wordt bewust niet afgewacht, maar mag ook niet als
    // onafgehandelde afwijzing eindigen.
    const terugdraaien = vi.fn().mockResolvedValue(undefined);
    render(createElement(Toaster));

    act(() => {
      showUndoToast('Verwijderd', 'Terug', terugdraaien);
    });
    const knop = await screen.findByRole('button', { name: 'Terug' });

    expect(() => act(() => knop.click())).not.toThrow();
    expect(terugdraaien).toHaveBeenCalled();
  });
});

// =============================================================================
// Aankondiging voor schermlezers
// =============================================================================

describe('aankondiging voor schermlezers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // De module onthoudt een seconde lang welke tekst er in beeld staat. Laat
    // je die timers hangen, dan slikt de volgende test dezelfde tekst in.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it('kondigt een gelukt-melding beleefd aan', () => {
    showSuccess('Beleefde bevestiging');

    const gebied = aankondigingen();
    expect(gebied).toHaveLength(1);
    expect(gebied[0].textContent).toBe('Beleefde bevestiging');
    expect(gebied[0].getAttribute('role')).toBe('status');
    expect(gebied[0].getAttribute('aria-live')).toBe('polite');
    expect(gebied[0].getAttribute('aria-atomic')).toBe('true');
  });

  it('onderbreekt bij een fout wél', () => {
    // Een fout mag de schermlezer onderbreken; een bevestiging niet. Staat dit
    // andersom, dan mist iemand die met een schermlezer werkt zijn foutmelding
    // omdat die achteraan in de rij wordt gezet.
    showError('Dringende foutmelding');

    const gebied = aankondigingen();
    expect(gebied[0].getAttribute('role')).toBe('alert');
    expect(gebied[0].getAttribute('aria-live')).toBe('assertive');
  });

  it('kondigt dezelfde tekst niet twee keer tegelijk aan', () => {
    // Twee gelijke aria-live-gebieden achter elkaar betekent dat de
    // schermlezer de gebruiker twee keer onderbreekt met dezelfde zin.
    showSuccess('Dubbele aankondiging');
    showSuccess('Dubbele aankondiging');
    showSuccess('Dubbele aankondiging');

    expect(aankondigingen()).toHaveLength(1);
  });

  it('haalt de aankondiging weer uit de pagina', () => {
    // Anders groeit de DOM bij elke melding aan met een blok tekst dat de
    // schermlezer bij het doorlopen van de pagina óók nog voorleest.
    showSuccess('Aankondiging die weer weg moet');
    expect(aankondigingen()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(aankondigingen()).toHaveLength(0);
  });

  it('kondigt dezelfde tekst later opnieuw aan', () => {
    // Ontdubbelen mag niet betekenen dat een melding voorgoed doof wordt: een
    // half uur later opnieuw opslaan hoort weer gemeld te worden.
    showSuccess('Aankondiging die terugkomt');
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    showSuccess('Aankondiging die terugkomt');

    expect(aankondigingen()).toHaveLength(1);
  });

  it('houdt twee verschillende teksten naast elkaar', () => {
    showSuccess('Twee teksten: de eerste');
    showError('Twee teksten: de tweede');

    expect(aankondigingen()).toHaveLength(2);
  });

  it('laat niets achter als de pagina onder de melding vandaan wordt getrokken', () => {
    // Een routewissel of een test die de body leegmaakt haalt het element weg
    // voordat de timer afloopt. `document.body.removeChild` gooit dan een
    // NotFoundError uit een timer, en zo'n fout heeft geen aanroeper meer die
    // hem kan opvangen.
    showSuccess('Aankondiging zonder pagina');
    document.body.innerHTML = '';

    expect(() => act(() => vi.advanceTimersByTime(1000))).not.toThrow();
  });

  it('kondigt een laadmelding aan', () => {
    showLoading('Laadmelding voor de schermlezer');

    expect(aankondigingen()[0]?.textContent).toBe('Laadmelding voor de schermlezer');
  });

  it('kondigt de tekst bij een ongedaan-maken-melding aan', () => {
    showUndoToast('Verwijderd, met terugdraaiknop', 'Ongedaan maken', () => {});

    expect(aankondigingen()[0]?.textContent).toBe('Verwijderd, met terugdraaiknop');
  });
});

// =============================================================================
// Meldingen rond een belofte
// =============================================================================

describe('showPromise', () => {
  it('geeft het resultaat van de belofte ongewijzigd door', async () => {
    const uitkomst = await showPromise(Promise.resolve({ id: 'stuk-1' }), {
      loading: 'Bezig...',
      success: 'Klaar',
      error: 'Mislukt',
    });

    expect(uitkomst).toEqual({ id: 'stuk-1' });
  });

  it('kondigt eerst het laden en daarna het slagen aan', async () => {
    await showPromise(Promise.resolve('klaar'), {
      loading: 'Belofte: bezig',
      success: 'Belofte: geslaagd',
      error: 'Belofte: mislukt',
    });

    const teksten = aankondigingen().map((element) => element.textContent);
    expect(teksten).toContain('Belofte: bezig');
    expect(teksten).toContain('Belofte: geslaagd');
  });

  it('gooit de oorspronkelijke fout door', async () => {
    // De aanroeper moet de fout zelf nog kunnen afhandelen; hem inslikken
    // betekent dat een mislukte opslag als geslaagd doorgaat.
    const fout = new Error('server weigert');

    await expect(
      showPromise(Promise.reject(fout), { loading: 'Bezig...', success: 'Klaar', error: 'Mislukt' }),
    ).rejects.toBe(fout);
  });

  it('kondigt een fout dringend aan', async () => {
    await showPromise(Promise.reject(new Error('stuk')), {
      loading: 'Belofte die faalt: bezig',
      success: 'Belofte die faalt: geslaagd',
      error: 'Belofte die faalt: mislukt',
    }).catch(() => {});

    const foutgebied = aankondigingen().find((element) => element.textContent === 'Belofte die faalt: mislukt');
    expect(foutgebied?.getAttribute('aria-live')).toBe('assertive');
  });

  it('gebruikt de foutfunctie om de tekst te maken', async () => {
    const fout = new Error('server weigert');
    const maakTekst = vi.fn((err: unknown) => `Mislukt: ${(err as Error).message}`);

    await showPromise(Promise.reject(fout), {
      loading: 'Belofte met eigen fouttekst: bezig',
      success: 'Belofte met eigen fouttekst: geslaagd',
      error: maakTekst,
    }).catch(() => {});

    expect(maakTekst).toHaveBeenCalledWith(fout);
    const teksten = aankondigingen().map((element) => element.textContent);
    expect(teksten).toContain('Mislukt: server weigert');
  });
});
