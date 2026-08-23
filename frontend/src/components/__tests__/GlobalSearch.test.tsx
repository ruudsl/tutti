/**
 * Het zoekvenster: wat de gebruiker intypt, ziet en aanklikt.
 *
 * De echte `useSearch` draait mee; alleen `fetch` is afgevangen. Dat is hier
 * bewust, want de interessante vragen gaan juist over wat er over de lijn gaat
 * (welk pad, welke parameters, welk token) en over wat er met het antwoord
 * gebeurt. Een nagemaakte hook zou precies die twee dingen wegnemen.
 *
 * Twee onderwerpen hebben extra aandacht gekregen:
 *
 *   - De verenigingsgrens. Aan de serverkant is zoeken over de grens heen
 *     eerder een echt lek gebleken. De frontend kan die grens niet bewaken -
 *     dat doet de server op het token - maar hij kan hem wel ondermijnen door
 *     zelf een bereik mee te sturen dat de gebruiker kan kiezen. De test
 *     hieronder legt vast dat het verzoek niets anders bevat dan de zoekterm
 *     en het gekozen type. Dat is een *wacht*, geen bewijs: hij staat ook op
 *     de huidige code groen.
 *
 *   - De koppeling tussen wat oplicht en wat opent. Daar zat een echte fout;
 *     zie de test "opent het resultaat dat oplicht".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { GlobalSearch, useGlobalSearch } from '../GlobalSearch';
import type { SearchResult } from '../../hooks/useSearch';

const navigeer = vi.fn();

vi.mock('react-router-dom', async () => {
  const echt = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...echt, useNavigate: () => navigeer };
});

// Alle t()-aanroepen in GlobalSearch geven een Nederlandse standaardtekst mee.
// Die gebruiken is genoeg om op te zoeken wat de gebruiker leest, en scheelt
// het optuigen van de hele i18n-opzet.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_sleutel: string, standaard?: string) => standaard ?? _sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

/** Alle verzoeken die de component deed, in volgorde. */
let verzoeken: { url: string; opties: RequestInit }[] = [];

/** Wat de server op /search teruggeeft. Per test in te stellen. */
let serverResultaten: SearchResult[] = [];
let serverSuggesties: string[] = [];
let serverRecent: { id: string; query: string; timestamp: string }[] = [];

function resultaat(over: Partial<SearchResult> & { id: string }): SearchResult {
  return {
    type: 'music',
    title: 'Titel',
    path: '/ergens',
    icon: 'music',
    ...over,
  } as SearchResult;
}

beforeEach(() => {
  verzoeken = [];
  serverResultaten = [];
  serverSuggesties = [];
  serverRecent = [];
  navigeer.mockClear();
  localStorage.setItem('token', 'token-van-deze-sessie');

  // jsdom kent scrollIntoView niet; het zoekvenster rolt het opgelichte
  // resultaat in beeld zodra de selectie verspringt.
  Element.prototype.scrollIntoView = vi.fn();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opties: RequestInit = {}) => {
      verzoeken.push({ url, opties });

      let lichaam: unknown = {};
      if (url.includes('/search/suggestions')) {
        lichaam = { suggestions: serverSuggesties };
      } else if (url.includes('/search/recent')) {
        lichaam = { searches: serverRecent };
      } else if (url.includes('/search?')) {
        lichaam = { results: serverResultaten, total: serverResultaten.length, query: '' };
      }

      return {
        ok: true,
        statusText: 'OK',
        json: async () => lichaam,
      } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** De zoekverzoeken (dus niet die voor suggesties of recente opdrachten). */
function zoekVerzoeken() {
  return verzoeken.filter((v) => v.url.includes('/search?'));
}

function toon(open = true) {
  const sluit = vi.fn();
  render(
    <MemoryRouter>
      <GlobalSearch isOpen={open} onClose={sluit} />
    </MemoryRouter>,
  );
  return { sluit };
}

async function typ(tekst: string) {
  const gebruiker = userEvent.setup({ delay: null });
  await gebruiker.type(screen.getByRole('textbox'), tekst);
  return gebruiker;
}

describe('zoekvenster', () => {
  it('is er niet zolang het niet geopend is', () => {
    toon(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zoekt pas vanaf twee tekens', async () => {
    toon();
    await typ('b');

    // Ruim over de 200ms ontdubbeling heen kijken, anders bewijst het niets.
    await new Promise((r) => setTimeout(r, 400));
    expect(zoekVerzoeken()).toHaveLength(0);

    await typ('a');
    await waitFor(() => expect(zoekVerzoeken()).toHaveLength(1));
    expect(zoekVerzoeken()[0].url).toContain('q=ba');
  });

  it('houdt het zoekverzoek binnen de vereniging', async () => {
    // De grens zelf ligt bij de server, die hem uit het token afleidt. Wat de
    // frontend kan verpesten is er zelf een bereik naast zetten dat de
    // gebruiker kiest. Daarom: het token gaat mee, en verder staat er niets in
    // het verzoek dan de zoekterm.
    toon();
    await typ('bach');

    await waitFor(() => expect(zoekVerzoeken()).toHaveLength(1));
    const verzoek = zoekVerzoeken()[0];

    const parameters = new URLSearchParams(verzoek.url.split('?')[1]);
    expect([...parameters.keys()]).toEqual(['q']);
    expect(verzoek.url.startsWith('/api/search?')).toBe(true);

    const koppen = verzoek.opties.headers as Record<string, string>;
    expect(koppen.Authorization).toBe('Bearer token-van-deze-sessie');
  });

  it('stuurt het gekozen type mee en verder nog steeds geen bereik', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: /Filters/ }));
    await gebruiker.selectOptions(screen.getByLabelText('Type'), 'member');
    await typ('anna');

    await waitFor(() => expect(zoekVerzoeken().length).toBeGreaterThan(0));
    const laatste = zoekVerzoeken()[zoekVerzoeken().length - 1];
    const parameters = new URLSearchParams(laatste.url.split('?')[1]);

    expect(parameters.get('q')).toBe('anna');
    expect(parameters.get('type')).toBe('member');
    expect([...parameters.keys()].sort()).toEqual(['q', 'type']);
  });

  it('zet de resultaten onder een kopje per soort', async () => {
    serverResultaten = [
      resultaat({ id: 'm1', type: 'music', title: 'Bolero', subtitle: 'Ravel', path: '/music/1' }),
      resultaat({ id: 'l1', type: 'member', title: 'Anna Jansen', path: '/members/1' }),
    ];
    toon();
    await typ('a b');

    await screen.findByText('Bolero');
    expect(screen.getByRole('heading', { name: /Muziek/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Leden/ })).toBeInTheDocument();
    expect(screen.getByText('Ravel')).toBeInTheDocument();
  });

  /**
   * BEWIJS van een echte fout.
   *
   * De lijst wordt per soort gegroepeerd getekend, maar het nummer dat aan
   * elke regel hing kwam uit een teller die tijdens het tekenen meeliep. De
   * pijltjestoetsen tellen daarentegen in `results`, de ongegroepeerde
   * volgorde zoals de server hem stuurde. Zodra de server twee soorten door
   * elkaar teruggaf, liepen die twee nummeringen uiteen: de gebruiker zag rij
   * A oplichten en kwam na Enter op pagina B uit.
   *
   * Rood zonder de reparatie: met de teller lichtte "Carmen" op, terwijl Enter
   * navigeerde naar /members/1 (Anna) - gemeten op de oude code, de
   * verwachting op de laatste regel faalde met '/members/1'.
   */
  it('opent het resultaat dat oplicht', async () => {
    serverResultaten = [
      resultaat({ id: 'm1', type: 'music', title: 'Bolero', path: '/music/1' }),
      resultaat({ id: 'l1', type: 'member', title: 'Anna Jansen', path: '/members/1' }),
      resultaat({ id: 'm2', type: 'music', title: 'Carmen', path: '/music/2' }),
    ];
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await typ('a b');
    await screen.findByText('Carmen');

    await gebruiker.keyboard('{ArrowDown}{ArrowDown}');

    const opgelicht = await waitFor(() => {
      const gekozen = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
      expect(gekozen).toHaveLength(1);
      return gekozen[0];
    });
    const titelVanOpgelicht = within(opgelicht).getByText(/Bolero|Anna Jansen|Carmen/).textContent;

    await gebruiker.keyboard('{Enter}');

    const paden: Record<string, string> = {
      Bolero: '/music/1',
      'Anna Jansen': '/members/1',
      Carmen: '/music/2',
    };
    expect(navigeer).toHaveBeenCalledWith(paden[titelVanOpgelicht as string]);
  });

  it('opent bij Enter zonder keuze het bovenste resultaat', async () => {
    serverResultaten = [
      resultaat({ id: 'm1', title: 'Bolero', path: '/music/1' }),
      resultaat({ id: 'm2', title: 'Carmen', path: '/music/2' }),
    ];
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await typ('co');
    await screen.findByText('Bolero');

    await gebruiker.keyboard('{Enter}');

    expect(navigeer).toHaveBeenCalledWith('/music/1');
  });

  it('opent het aangeklikte resultaat en onthoudt de zoekterm', async () => {
    serverResultaten = [resultaat({ id: 'm1', title: 'Bolero', path: '/music/1' })];
    const gebruiker = userEvent.setup({ delay: null });
    const { sluit } = toon();
    await typ('bolero');
    await screen.findByText('Bolero');

    await gebruiker.click(screen.getByText('Bolero'));

    expect(navigeer).toHaveBeenCalledWith('/music/1');
    expect(sluit).toHaveBeenCalled();
    await waitFor(() =>
      expect(verzoeken.some((v) => v.url.endsWith('/search/recent') && v.opties.method === 'POST')).toBe(true),
    );
  });

  it('meldt het wanneer er niets gevonden is', async () => {
    serverResultaten = [];
    toon();
    await typ('xyzzy');

    expect(await screen.findByText('Geen resultaten gevonden')).toBeInTheDocument();
    expect(screen.getByText('Probeer een andere zoekterm')).toBeInTheDocument();
  });

  it('biedt suggesties aan wanneer er geen resultaten zijn', async () => {
    serverSuggesties = ['Bolero', 'Boheemse rapsodie'];
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await typ('bol');

    const suggestie = await screen.findByRole('button', { name: 'Boheemse rapsodie' });
    await gebruiker.click(suggestie);

    expect(screen.getByRole('textbox')).toHaveValue('Boheemse rapsodie');
  });

  describe('recente zoekopdrachten', () => {
    beforeEach(() => {
      serverRecent = [
        { id: 'r1', query: 'bolero', timestamp: '2026-08-01T10:00:00Z' },
        { id: 'r2', query: 'carmen', timestamp: '2026-08-02T10:00:00Z' },
      ];
    });

    it('vult de zoekbalk bij aanklikken', async () => {
      const gebruiker = userEvent.setup({ delay: null });
      toon();

      await gebruiker.click(await screen.findByRole('button', { name: /carmen/ }));

      expect(screen.getByRole('textbox')).toHaveValue('carmen');
    });

    it('haalt er eentje weg', async () => {
      const gebruiker = userEvent.setup({ delay: null });
      toon();
      await screen.findByRole('button', { name: /bolero/ });

      const rij = screen.getByRole('button', { name: /bolero/ }).closest('li') as HTMLElement;
      await gebruiker.click(within(rij).getByRole('button', { name: 'Verwijderen' }));

      await waitFor(() => expect(screen.queryByRole('button', { name: /bolero/ })).not.toBeInTheDocument());
      expect(verzoeken.some((v) => v.url.endsWith('/search/recent/r1') && v.opties.method === 'DELETE')).toBe(true);
      expect(screen.getByRole('button', { name: /carmen/ })).toBeInTheDocument();
    });

    it('wist ze allemaal', async () => {
      const gebruiker = userEvent.setup({ delay: null });
      toon();
      await screen.findByRole('button', { name: /bolero/ });

      await gebruiker.click(screen.getByRole('button', { name: 'Alles wissen' }));

      await waitFor(() => expect(screen.queryByText('Recente zoekopdrachten')).not.toBeInTheDocument());
    });
  });

  it('sluit met Escape en met een klik naast het venster', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const { sluit } = toon();

    await gebruiker.keyboard('{Escape}');
    expect(sluit).toHaveBeenCalled();

    sluit.mockClear();
    await gebruiker.click(screen.getByRole('dialog'));
    expect(sluit).not.toHaveBeenCalled();
  });
});

/** Kleine gastheer om de sneltoetsen van useGlobalSearch te kunnen bedienen. */
function Gastheer() {
  const { isOpen, open, close, toggle } = useGlobalSearch();
  const [tekst, setTekst] = useState('');

  return (
    <div>
      <span>{isOpen ? 'open' : 'dicht'}</span>
      <input aria-label="ergens anders typen" value={tekst} onChange={(e) => setTekst(e.target.value)} />
      <button onClick={open}>openen</button>
      <button onClick={close}>sluiten</button>
      <button onClick={toggle}>omschakelen</button>
    </div>
  );
}

describe('sneltoetsen van het zoekvenster', () => {
  it('opent en sluit met Ctrl+K', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Gastheer />);

    await gebruiker.keyboard('{Control>}k{/Control}');
    expect(screen.getByText('open')).toBeInTheDocument();

    await gebruiker.keyboard('{Control>}k{/Control}');
    expect(screen.getByText('dicht')).toBeInTheDocument();
  });

  it('opent met de schuine streep', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Gastheer />);

    await gebruiker.keyboard('/');

    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('laat de schuine streep met rust terwijl er getypt wordt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Gastheer />);

    await gebruiker.type(screen.getByLabelText('ergens anders typen'), 'en/of');

    expect(screen.getByText('dicht')).toBeInTheDocument();
    expect(screen.getByLabelText('ergens anders typen')).toHaveValue('en/of');
  });
});
