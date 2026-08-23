/**
 * De openbare agenda: wat een willekeurige voorbijganger te zien krijgt.
 *
 * Deze pagina staat achter /calendar/:slug en vraagt niets: geen inloggen, geen
 * sessie. Hij wordt ingesloten op de website van de vereniging en door
 * zoekmachines ingelezen. Wat hier eenmaal op stond is niet meer terug te
 * halen, en dat maakt twee dingen belangrijker dan de opmaak.
 *
 * Ten eerste ledengegevens. De pagina tekende klakkeloos wat er binnenkwam.
 * Vandaag stuurt de server keurig alleen titel, datum en locatie mee, dus deze
 * eerste groep tests is een *wacht* en geen bewijs: hij stond ook op de oude
 * code groen. Hij is er om roodkleuren zodra iemand een veld meer uit de
 * database naar buiten laat lopen.
 *
 * Ten tweede concepten en interne evenementen. Dat was wél stuk: elk
 * evenement dat in het antwoord zat werd getekend, ook als het als concept of
 * als intern was aangemerkt. De zeef `isOpenbaar` in PublicCalendar.tsx is
 * daarvoor toegevoegd; de tests eronder zijn zonder die zeef rood - nagelopen
 * met `git checkout HEAD -- src/pages/PublicCalendar.tsx`:
 *
 *   × laat een concept uit de agenda weg
 *   × laat een intern evenement uit de agenda weg
 *   × meldt een lege agenda als alles concept is
 *   × houdt een concept van het infoscherm
 *   × houdt een intern eerstvolgend concert van het infoscherm
 *
 * De zeef staat bewust in de pagina en niet alleen aan de serverkant: de
 * server bepaalt vandaag welke velden hij meestuurt, maar deze pagina beslist
 * wat er op het scherm komt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicCalendar from '../PublicCalendar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

/** Antwoordt op elk verzoek met dit lichaam, zoals de openbare route doet. */
function zetServerKlaar(lichaam: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => lichaam })),
  );
}

function toon(pad = '/calendar/harmonie') {
  render(
    <MemoryRouter initialEntries={[pad]}>
      <Routes>
        <Route path="/calendar/:slug" element={<PublicCalendar />} />
      </Routes>
    </MemoryRouter>,
  );
}

const OPENBAAR_CONCERT = {
  id: 'ev-1',
  type: 'concert' as const,
  title: 'Najaarsconcert',
  date: '2026-09-12',
  startTime: '20:00:00',
  endTime: '22:30:00',
  venue: 'De Harmonie',
  city: 'Zwolle',
  ticketPrice: 12.5,
};

const AGENDA = {
  association: { name: 'Harmonie Sint Caecilia', slug: 'harmonie' },
  events: [OPENBAAR_CONCERT],
  generatedAt: '2026-08-20T09:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('openbare agenda - wat de bezoeker ziet', () => {
  it('toont de vereniging en het concert met tijd, plaats en prijs', async () => {
    zetServerKlaar(AGENDA);
    toon();

    expect(await screen.findByRole('heading', { name: 'Harmonie Sint Caecilia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Najaarsconcert' })).toBeInTheDocument();
    // De begintijd wordt op vijf tekens afgekapt en met de eindtijd getoond.
    expect(screen.getByText(/20:00/)).toHaveTextContent('20:00 - 22:30');
    expect(screen.getByText(/De Harmonie/)).toHaveTextContent('De Harmonie, Zwolle');
    // De opmaak van het bedrag hangt van de taal af; het getal niet.
    expect(screen.getByText(/Tickets:/)).toHaveTextContent(/12[.,]50/);
  });

  it('zet de evenementen onder een maandkop', async () => {
    zetServerKlaar({
      ...AGENDA,
      events: [OPENBAAR_CONCERT, { ...OPENBAAR_CONCERT, id: 'ev-2', title: 'Kerstconcert', date: '2026-12-19' }],
    });
    toon();

    // De koppen worden uit de datum afgeleid, dus hier op dezelfde manier
    // opgebouwd in plaats van een taal vast te leggen.
    const maand = (datum: string) => new Date(datum).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    await screen.findByRole('heading', { name: 'Najaarsconcert' });
    const koppen = screen.getAllByRole('heading', { level: 2 }).map((k) => k.textContent);
    expect(koppen).toHaveLength(2);
    expect(koppen[0]).toBe(maand('2026-09-12'));
    expect(koppen[1]).toBe(maand('2026-12-19'));
  });

  it('meldt een lege agenda als de vereniging niets gepland heeft', async () => {
    zetServerKlaar({ ...AGENDA, events: [] });
    toon();

    expect(await screen.findByText('publicCalendar.noUpcomingEvents')).toBeInTheDocument();
  });

  it('zegt het als de vereniging niet bestaat in plaats van leeg te blijven', async () => {
    zetServerKlaar({}, false);
    toon();

    expect(await screen.findByRole('heading', { name: 'Calendar Not Found' })).toBeInTheDocument();
    expect(screen.getByText('Association not found')).toBeInTheDocument();
  });

  it('blijft niet in de laadstand hangen als het verzoek zelf mislukt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    toon();

    expect(await screen.findByRole('heading', { name: 'Calendar Not Found' })).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('vraagt de openbare route op voor de slug uit de url', async () => {
    zetServerKlaar(AGENDA);
    toon('/calendar/fanfare-oost');

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/calendar/public/fanfare-oost?months=6'));
  });

  it('volgt de gevraagde stand van het thema', async () => {
    zetServerKlaar(AGENDA);
    toon('/calendar/harmonie?theme=dark');

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });
});

describe('openbare agenda - geen ledengegevens', () => {
  // Wacht, geen bewijs: deze test stond ook op de oude code groen. Hij legt
  // vast dat de pagina alleen tekent wat ze zelf uitkiest, zodat een veld dat
  // er aan de serverkant bij komt hier opvalt in plaats van op de website.
  it('tekent geen naam, adres of telefoonnummer die in het antwoord meeliften', async () => {
    zetServerKlaar({
      ...AGENDA,
      events: [
        {
          ...OPENBAAR_CONCERT,
          organizerName: 'Anna de Groot',
          contactEmail: 'anna.degroot@example.org',
          contactPhone: '06-12345678',
          internalNotes: 'Anna regelt de sleutel, bel haar thuis',
          attendees: [{ name: 'Bram Bakker', email: 'bram@example.org' }],
        },
      ],
    });
    toon();

    await screen.findByRole('heading', { name: 'Najaarsconcert' });
    const tekst = document.body.textContent ?? '';
    for (const gegeven of [
      'Anna de Groot',
      'anna.degroot@example.org',
      '06-12345678',
      'sleutel',
      'Bram Bakker',
      'bram@example.org',
    ]) {
      expect(tekst).not.toContain(gegeven);
    }
    // En geen enkel e-mailadres, ook niet één dat hier niet bij naam staat.
    expect(tekst).not.toMatch(/@/);
  });
});

describe('openbare agenda - concepten en interne evenementen', () => {
  it('laat een concept uit de agenda weg', async () => {
    zetServerKlaar({
      ...AGENDA,
      events: [
        OPENBAAR_CONCERT,
        { ...OPENBAAR_CONCERT, id: 'ev-3', title: 'Nog niet vastgelegd concert', status: 'draft' },
      ],
    });
    toon();

    expect(await screen.findByRole('heading', { name: 'Najaarsconcert' })).toBeInTheDocument();
    expect(screen.queryByText('Nog niet vastgelegd concert')).toBeNull();
  });

  it('laat een intern evenement uit de agenda weg', async () => {
    zetServerKlaar({
      ...AGENDA,
      events: [
        OPENBAAR_CONCERT,
        { ...OPENBAAR_CONCERT, id: 'ev-4', title: 'Ledenvergadering', visibility: 'internal' },
        { ...OPENBAAR_CONCERT, id: 'ev-5', title: 'Bestuursoverleg', isPublic: false },
        { ...OPENBAAR_CONCERT, id: 'ev-6', title: 'Sinterklaasavond leden', internal: true },
      ],
    });
    toon();

    expect(await screen.findByRole('heading', { name: 'Najaarsconcert' })).toBeInTheDocument();
    expect(screen.queryByText('Ledenvergadering')).toBeNull();
    expect(screen.queryByText('Bestuursoverleg')).toBeNull();
    expect(screen.queryByText('Sinterklaasavond leden')).toBeNull();
  });

  it('meldt een lege agenda als alles concept is', async () => {
    zetServerKlaar({
      ...AGENDA,
      events: [{ ...OPENBAAR_CONCERT, status: 'draft' }],
    });
    toon();

    // Ook de maandkop hoort weg te blijven: daaruit is anders af te leiden dát
    // er iets gepland staat.
    expect(await screen.findByText('publicCalendar.noUpcomingEvents')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});

const INFOSCHERM = {
  association: { name: 'Harmonie Sint Caecilia' },
  nextConcert: {
    id: 'con-1',
    name: 'Najaarsconcert',
    date: '2026-09-12',
    startTime: '20:00:00',
    venue: 'De Harmonie',
    city: 'Zwolle',
    daysUntil: 1,
  },
  nextRehearsal: {
    id: 'rep-1',
    date: '2026-08-25',
    startTime: '19:30:00',
    endTime: '21:45:00',
    location: 'Verenigingsgebouw',
    orchestraName: 'Harmonieorkest',
  },
  upcomingConcerts: [{ id: 'con-2', name: 'Kerstconcert', date: '2026-12-19', startTime: '19:00:00', venue: 'Kerk' }],
  announcement: { title: 'Repetitie verplaatst', content: 'Volgende week dinsdag', publishedAt: '2026-08-20' },
  currentTime: '2026-08-23T19:00:00.000Z',
  refreshInterval: 60,
};

describe('infoscherm in de hal', () => {
  it('toont het eerstvolgende concert, de repetitie en de mededeling', async () => {
    zetServerKlaar(INFOSCHERM);
    toon('/calendar/harmonie?mode=info-screen');

    expect(await screen.findByRole('heading', { name: 'Najaarsconcert' })).toBeInTheDocument();
    // Eén dag te gaan hoort als "morgen" te lezen en niet als "In 1 days".
    expect(screen.getByText('Tomorrow!')).toBeInTheDocument();
    expect(screen.getByText(/De Harmonie/)).toHaveTextContent('De Harmonie, Zwolle');
    expect(screen.getByRole('heading', { name: 'Harmonieorkest' })).toBeInTheDocument();
    expect(screen.getByText(/19:30/)).toHaveTextContent('19:30 - 21:45');
    expect(screen.getByRole('heading', { name: 'Repetitie verplaatst' })).toBeInTheDocument();
    expect(screen.getByText('Volgende week dinsdag')).toBeInTheDocument();
  });

  it('vraagt de infoschermroute op en niet de agenda', async () => {
    zetServerKlaar(INFOSCHERM);
    toon('/calendar/harmonie?mode=info-screen');

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/calendar/info-screen/harmonie'));
  });

  it('houdt een concept van het infoscherm', async () => {
    zetServerKlaar({
      ...INFOSCHERM,
      upcomingConcerts: [
        ...INFOSCHERM.upcomingConcerts,
        { id: 'con-3', name: 'Voorlopig plan', date: '2027-01-10', status: 'draft' },
      ],
    });
    toon('/calendar/harmonie?mode=info-screen');

    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.queryByText('Voorlopig plan')).toBeNull();
  });

  it('houdt een intern eerstvolgend concert van het infoscherm', async () => {
    zetServerKlaar({
      ...INFOSCHERM,
      nextConcert: { ...INFOSCHERM.nextConcert, name: 'Besloten jubileum', visibility: 'internal' },
      nextRehearsal: null,
      upcomingConcerts: [],
      announcement: null,
    });
    toon('/calendar/harmonie?mode=info-screen');

    // Er blijft niets over, en dan hoort het scherm dat te zeggen in plaats van
    // het besloten evenement alsnog groot in beeld te zetten.
    expect(await screen.findByText('publicCalendar.noUpcomingEvents')).toBeInTheDocument();
    expect(screen.queryByText('Besloten jubileum')).toBeNull();
  });

  it('zegt het als er niets te melden valt', async () => {
    zetServerKlaar({
      ...INFOSCHERM,
      nextConcert: null,
      nextRehearsal: null,
      upcomingConcerts: [],
      announcement: null,
    });
    toon('/calendar/harmonie?mode=info-screen');

    expect(await screen.findByText('publicCalendar.noUpcomingEvents')).toBeInTheDocument();
  });
});
