/**
 * De oefenpagina: doelen stellen, sessies loggen en teruglezen wat er
 * geoefend is.
 *
 * Alles wat de pagina toont komt van de api-laag, en die is hier een
 * dubbelganger: er gaat geen enkel verzoek de deur uit. De zware onderdelen
 * eromheen (de oefenklok, het opnamevenster en het snelle logvenster) zijn
 * vervangen door dubbelgangers, zodat de tests over de pagina zelf gaan; het
 * bevestigingsvenster bij verwijderen is wel het echte, want dat is de knop
 * waar het misgaat als hij wegvalt.
 *
 * Wat hier bewust vastligt:
 *   - De duurnotatie. Minder dan een uur is "45 min", daarboven "1u 30m", en
 *     een rond uur is "2u" zonder minuten.
 *   - Dat er pas naar titels gezocht wordt als het logvenster openstaat.
 *   - Dat loggen zonder gekozen stuk niet kan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Practice from '../Practice';
import * as api from '../../api';
import type { PracticeStats } from '../../api/practice';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api');
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
      i18n: { language: 'nl' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  };
});

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// De oefenklok heeft zijn eigen tests; hier telt alleen wat de pagina doet
// zodra een sessie op de klok afgelopen is.
vi.mock('../../components/PracticeTimer', () => ({
  default: ({ onSessionEnd }: { onSessionEnd?: (minuten: number) => void }) => (
    <button onClick={() => onSessionEnd?.(42)}>klok-afgelopen</button>
  ),
}));
vi.mock('../../components/PracticeLogModal', () => ({
  PracticeLogModal: ({ musicTitle, onClose }: { musicTitle: string; onClose: () => void }) => (
    <div>
      <span>snellog: {musicTitle}</span>
      <button onClick={onClose}>snellog-sluiten</button>
    </div>
  ),
}));
vi.mock('../../components/AudioRecorder', () => ({
  AudioRecorder: ({ onClose }: { onClose: () => void }) => (
    <div>
      <span>opnamevenster</span>
      <button onClick={onClose}>opname-sluiten</button>
    </div>
  ),
}));

const mobiel = { ja: false };
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobiel.ja }));

const STATISTIEK: PracticeStats = {
  totalMinutes: 0,
  weekMinutes: 0,
  monthMinutes: 0,
  currentStreak: 0,
  mostPracticed: [],
};

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const statistiek = vi.mocked(api.getPracticeStats);
const doelen = vi.mocked(api.getPracticeGoals);
const logs = vi.mocked(api.getPracticeLogs);
const titels = vi.mocked(api.getMusicTitles);
const logSessie = vi.mocked(api.logPractice);
const verwijderLog = vi.mocked(api.deletePracticeLog);
const stelDoelIn = vi.mocked(api.setPracticeGoal);
const verwijderDoel = vi.mocked(api.deletePracticeGoal);

beforeEach(() => {
  vi.clearAllMocks();
  mobiel.ja = false;
  statistiek.mockResolvedValue({ ...STATISTIEK });
  doelen.mockResolvedValue({ goals: [], progress: { daily: 0, weekly: 0 } });
  logs.mockResolvedValue([]);
  titels.mockResolvedValue([]);
  logSessie.mockResolvedValue({} as never);
  verwijderLog.mockResolvedValue({} as never);
  stelDoelIn.mockResolvedValue({} as never);
  verwijderDoel.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Tekent de pagina en wacht tot de cijfers binnen zijn. De kop 'Oefenen' staat
 * er tijdens het laden ook al, dus daar valt niet op te wachten; de kop
 * 'Doelen' verschijnt pas als het skelet weg is.
 */
async function toonPagina() {
  render(<Practice />, { wrapper: wikkel });
  return screen.findByRole('heading', { name: 'Doelen' });
}

describe('Practice: overzicht', () => {
  it('toont de kerncijfers van het oefenen', async () => {
    statistiek.mockResolvedValue({
      ...STATISTIEK,
      currentStreak: 7,
      weekMinutes: 45,
      monthMinutes: 90,
      totalMinutes: 120,
    });
    await toonPagina();

    expect(screen.getByText('7')).toBeInTheDocument();
    // Minder dan een uur in minuten, daarboven in uren en minuten, en een
    // rond uur zonder minuten erachter.
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('1u 30m')).toBeInTheDocument();
    expect(screen.getByText('2u')).toBeInTheDocument();
  });

  it('meldt het als er nog geen sessies gelogd zijn', async () => {
    await toonPagina();

    expect(screen.getByText('Nog geen oefensessies gelogd.')).toBeInTheDocument();
    expect(screen.getAllByText('Geen doel ingesteld')).toHaveLength(2);
  });

  it('toont de gelogde sessies met notitie en duur', async () => {
    logs.mockResolvedValue([
      {
        id: 'log-1',
        durationMinutes: 30,
        practicedAt: '2026-08-20T10:00:00.000Z',
        notes: 'Langzaam gestudeerd',
        musicTitle: { id: 'stuk-1', title: 'Ouverture 1812' },
      },
    ] as never);
    await toonPagina();

    const regel = (await screen.findByText('Ouverture 1812')).closest('tr')!;
    expect(within(regel).getByText('Langzaam gestudeerd')).toBeInTheDocument();
    expect(within(regel).getByText('30 min')).toBeInTheDocument();
  });

  it('toont de meest geoefende stukken met een knop om snel te loggen', async () => {
    const gebruiker = userEvent.setup();
    statistiek.mockResolvedValue({
      ...STATISTIEK,
      mostPracticed: [{ id: 'stuk-1', title: 'Bolero', arranger: 'Van Dijk', totalMinutes: 75, sessionCount: 3 }],
    });
    await toonPagina();

    const regel = screen.getByText('Bolero').closest('tr')!;
    expect(within(regel).getByText('- Van Dijk')).toBeInTheDocument();
    expect(within(regel).getByText('1u 15m')).toBeInTheDocument();
    expect(within(regel).getByText('3x')).toBeInTheDocument();

    await gebruiker.click(within(regel).getByRole('button', { name: 'Loggen' }));
    expect(screen.getByText('snellog: Bolero')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'snellog-sluiten' }));
    expect(screen.queryByText('snellog: Bolero')).not.toBeInTheDocument();
  });

  it('opent en sluit het opnamevenster', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'Nieuwe opname' }));
    expect(screen.getByText('opnamevenster')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'opname-sluiten' }));
    expect(screen.queryByText('opnamevenster')).not.toBeInTheDocument();
  });

  it('meldt een sessie die op de oefenklok afgelopen is', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'klok-afgelopen' }));

    expect(showSuccess).toHaveBeenCalledWith('Oefensessie van 42 minuten beeindigd!');
  });
});

describe('Practice: doelen', () => {
  const DAGDOEL = {
    goals: [
      { id: 'doel-1', goalType: 'daily' as const, targetMinutes: 60 },
      { id: 'doel-2', goalType: 'weekly' as const, targetMinutes: 300 },
    ],
    progress: { daily: 30, weekly: 300 },
  };

  it('toont de voortgang per doel en meldt een behaald doel', async () => {
    doelen.mockResolvedValue(DAGDOEL as never);
    await toonPagina();

    expect(screen.getByText('30 min / 1u')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('5u / 5u')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    // Alleen het weekdoel is af.
    expect(screen.getAllByText('Doel behaald!')).toHaveLength(1);
  });

  it('slaat een nieuw weekdoel op', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'Doel instellen' }));
    await gebruiker.selectOptions(screen.getByLabelText('Type doel'), 'weekly');

    const minuten = screen.getByLabelText('Doel (minuten)');
    await gebruiker.clear(minuten);
    await gebruiker.type(minuten, '2');
    expect(minuten).toHaveValue(302);

    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(stelDoelIn).toHaveBeenCalledWith('weekly', 302));
    expect(showSuccess).toHaveBeenCalledWith('Doel opgeslagen');
    // Het formulier klapt dicht zodra het doel bewaard is.
    await waitFor(() => expect(screen.queryByLabelText('Type doel')).not.toBeInTheDocument());
  });

  it('meldt een fout van de server bij het opslaan van een doel', async () => {
    const gebruiker = userEvent.setup();
    stelDoelIn.mockRejectedValue({ response: { data: { error: 'Doel te hoog' } } });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'Doel instellen' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Doel te hoog'));
    // Het formulier blijft staan zodat de invoer niet kwijtraakt.
    expect(screen.getByLabelText('Type doel')).toBeInTheDocument();
  });

  it('houdt het doel tussen 1 en 1440 minuten', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'Doel instellen' }));
    const minuten = screen.getByLabelText('Doel (minuten)');

    // Het veld staat op 30; een nul erachter maakt er 300 van.
    await gebruiker.type(minuten, '0');
    expect(minuten).toHaveValue(300);

    // Nog een nul zou 3000 geven, maar een doel van meer dan een etmaal kan
    // niet: het veld knijpt de waarde af op 1440 minuten.
    await gebruiker.type(minuten, '0');
    expect(minuten).toHaveValue(1440);

    // Een nul valt terug op het standaarddoel van 30 minuten in plaats van op
    // de ondergrens 1: het veld leest een 0 als "niets ingevuld".
    fireEvent.change(minuten, { target: { value: '0' } });
    expect(minuten).toHaveValue(30);
  });

  it('verwijdert een doel na bevestiging', async () => {
    const gebruiker = userEvent.setup();
    doelen.mockResolvedValue(DAGDOEL as never);
    await toonPagina();

    const dagblok = screen.getByText('Dagelijks doel').closest('div')!;
    await gebruiker.click(within(dagblok).getByRole('button', { name: '×' }));

    const venster = screen.getByRole('alertdialog');
    expect(within(venster).getByText('Doel verwijderen')).toBeInTheDocument();
    await gebruiker.click(within(venster).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(verwijderDoel).toHaveBeenCalledWith('doel-1'));
    expect(showSuccess).toHaveBeenCalledWith('Doel verwijderd');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('verwijdert niets als de bevestiging afgebroken wordt', async () => {
    const gebruiker = userEvent.setup();
    doelen.mockResolvedValue(DAGDOEL as never);
    await toonPagina();

    const weekblok = screen.getByText('Wekelijks doel').closest('div')!;
    await gebruiker.click(within(weekblok).getByRole('button', { name: '×' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuleren' }));

    expect(verwijderDoel).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Practice: een sessie loggen', () => {
  const TITELS = [
    { id: 'stuk-1', title: 'Ouverture 1812', arranger: 'Van Dijk' },
    { id: 'stuk-2', title: 'Bolero' },
  ];

  async function openLogvenster(gebruiker: ReturnType<typeof userEvent.setup>) {
    await gebruiker.click(screen.getByRole('button', { name: '+ Oefensessie loggen' }));
  }

  it('zoekt pas naar titels zodra het logvenster openstaat', async () => {
    const gebruiker = userEvent.setup();
    titels.mockResolvedValue(TITELS as never);
    await toonPagina();

    expect(titels).not.toHaveBeenCalled();

    await openLogvenster(gebruiker);

    await waitFor(() => expect(titels).toHaveBeenCalledWith({ search: '' }));
    expect(await screen.findByText('Ouverture 1812')).toBeInTheDocument();

    await gebruiker.type(screen.getByPlaceholderText('Zoek titel...'), 'bol');
    await waitFor(() => expect(titels).toHaveBeenCalledWith({ search: 'bol' }));
  });

  it('wijst de weg als er niets te kiezen valt', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();
    await openLogvenster(gebruiker);

    expect(await screen.findByText('Typ om te zoeken')).toBeInTheDocument();

    await gebruiker.type(screen.getByPlaceholderText('Zoek titel...'), 'mahler');

    expect(await screen.findByText('Geen titels gevonden')).toBeInTheDocument();
  });

  it('logt een sessie met stuk, duur en notitie', async () => {
    const gebruiker = userEvent.setup();
    titels.mockResolvedValue(TITELS as never);
    await toonPagina();
    await openLogvenster(gebruiker);

    const logknop = screen.getByRole('button', { name: 'Loggen' });
    expect(logknop).toBeDisabled();

    await gebruiker.click(await screen.findByText('Ouverture 1812'));
    expect(logknop).toBeEnabled();

    // Het duurveld is een gestuurd getalveld dat een lege waarde meteen op 30
    // terugzet; letter voor letter typen zou daarom achter de 30 aanplakken.
    // De browser vervangt bij het slepen van de schuifregelaar de hele waarde,
    // en dat is wat hier gebeurt.
    const duur = screen.getByLabelText('Duur');
    fireEvent.change(duur, { target: { value: '45' } });
    await gebruiker.type(screen.getByPlaceholderText('Optioneel: wat heb je geoefend?'), 'Maat 40 tot 60');

    await gebruiker.click(logknop);

    await waitFor(() => expect(logSessie).toHaveBeenCalledWith('stuk-1', 45, 'Maat 40 tot 60'));
    expect(showSuccess).toHaveBeenCalledWith('Oefensessie gelogd');
    // Het venster gaat dicht en de volgende sessie begint weer blanco.
    await waitFor(() => expect(screen.queryByPlaceholderText('Zoek titel...')).not.toBeInTheDocument());

    await openLogvenster(gebruiker);
    expect(screen.getByLabelText('Duur')).toHaveValue(30);
    expect(screen.getByRole('button', { name: 'Loggen' })).toBeDisabled();
  });

  it('laat de notitie weg als er niets ingevuld is', async () => {
    const gebruiker = userEvent.setup();
    titels.mockResolvedValue(TITELS as never);
    await toonPagina();
    await openLogvenster(gebruiker);

    await gebruiker.click(await screen.findByText('Bolero'));
    await gebruiker.click(screen.getByRole('button', { name: 'Loggen' }));

    await waitFor(() => expect(logSessie).toHaveBeenCalledWith('stuk-2', 30, undefined));
  });

  it('meldt een fout van de server en houdt het venster open', async () => {
    const gebruiker = userEvent.setup();
    titels.mockResolvedValue(TITELS as never);
    logSessie.mockRejectedValue({ response: { data: { error: 'Sessie te lang' } } });
    await toonPagina();
    await openLogvenster(gebruiker);

    await gebruiker.click(await screen.findByText('Bolero'));
    await gebruiker.click(screen.getByRole('button', { name: 'Loggen' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Sessie te lang'));
    expect(screen.getByPlaceholderText('Zoek titel...')).toBeInTheDocument();
  });

  it('sluit het venster met annuleren', async () => {
    const gebruiker = userEvent.setup();
    await toonPagina();
    await openLogvenster(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(screen.queryByPlaceholderText('Zoek titel...')).not.toBeInTheDocument();
    expect(logSessie).not.toHaveBeenCalled();
  });
});

describe('Practice: een sessie verwijderen', () => {
  const LOG = [
    {
      id: 'log-1',
      durationMinutes: 30,
      practicedAt: '2026-08-20T10:00:00.000Z',
      musicTitle: { id: 'stuk-1', title: 'Ouverture 1812' },
    },
  ];

  it('verwijdert een sessie na bevestiging', async () => {
    const gebruiker = userEvent.setup();
    logs.mockResolvedValue(LOG as never);
    await toonPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));

    const venster = screen.getByRole('alertdialog');
    expect(within(venster).getByText('Weet je zeker dat je deze oefensessie wilt verwijderen?')).toBeInTheDocument();
    await gebruiker.click(within(venster).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(verwijderLog).toHaveBeenCalledWith('log-1'));
    expect(showSuccess).toHaveBeenCalledWith('Oefensessie verwijderd');
  });

  it('meldt een fout van de server en laat de sessie staan', async () => {
    const gebruiker = userEvent.setup();
    logs.mockResolvedValue(LOG as never);
    verwijderLog.mockRejectedValue({ response: { data: {} } });
    await toonPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.getByText('Ouverture 1812')).toBeInTheDocument();
  });
});

describe('Practice: op een telefoon', () => {
  it('schuift het logformulier van onderen in beeld', async () => {
    const gebruiker = userEvent.setup();
    mobiel.ja = true;
    titels.mockResolvedValue([{ id: 'stuk-1', title: 'Bolero' }] as never);
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: '+ Oefensessie loggen' }));

    expect(screen.getByPlaceholderText('Zoek titel...')).toBeInTheDocument();
    await gebruiker.click(await screen.findByText('Bolero'));
    await gebruiker.click(screen.getByRole('button', { name: 'Loggen' }));

    await waitFor(() => expect(logSessie).toHaveBeenCalledWith('stuk-1', 30, undefined));
  });
});
