/**
 * Het systeemscherm: draait alles nog, en zo niet, waar zit het.
 *
 * Dit scherm is er voor het moment dat iemand belt dat het niet werkt. Dan
 * moet er niet "er ging iets mis" staan maar wát er mis is: welke dienst, hoe
 * lang de server al draait, en of het antwoord traag is. Twee dingen zijn
 * daarbij eigen aan deze pagina.
 *
 * Ten eerste is een 503 hier een geldig antwoord en geen storing: een server
 * die zegt dat hij ongezond is, vertelt precies wat dit scherm moet tonen.
 *
 * Ten tweede is een 403 iets anders dan een kapotte server. Wie geen beheerder
 * is hoort te lezen dat hij er niet bij mag, zonder knop om het nog eens te
 * proberen - opnieuw proberen helpt niet en de knop suggereert van wel.
 *
 * Alles hier is een *wacht*: dit gedrag zat er al en de tests blijven op de
 * oude code groen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import axios from 'axios';
import HealthDashboard from '../HealthDashboard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('axios', () => {
  const get = vi.fn();
  const isAxiosError = (fout: unknown) => !!(fout as { isAxiosError?: boolean })?.isAxiosError;
  return { default: { get, isAxiosError }, get, isAxiosError };
});

const GEZOND = {
  status: 'healthy',
  timestamp: '2026-08-23T10:00:00.000Z',
  uptime: 90061,
  version: '1.12.0',
  environment: 'production',
  services: {
    database: { status: 'healthy', latency: 3 },
    disk: { status: 'healthy', details: { freeGb: 42, totalGb: 100 } },
    memory: { status: 'healthy' },
  },
  system: {
    platform: 'linux',
    arch: 'x64',
    nodeVersion: 'v22.11.0',
    cpuCount: 4,
    hostname: 'tutti-web-1',
    loadAverage: [0.512, 0.25, 0.1],
  },
};

function antwoord(gegevens: unknown) {
  vi.mocked(axios.get).mockResolvedValue({ data: gegevens });
}

/** Een fout zoals axios die geeft, met een statuscode uit het antwoord. */
function axiosFout(status: number) {
  return { isAxiosError: true, response: { status } };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('systeemscherm - wat er op staat als alles draait', () => {
  it('toont versie, omgeving en hoe lang de server draait', async () => {
    antwoord(GEZOND);
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('1.12.0')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    // 90061 seconden is 1 dag, 1 uur, 1 minuut en 1 seconde.
    expect(screen.getByText('1health.days 1health.hours 1health.minutes 1health.seconds')).toBeInTheDocument();
  });

  it('zegt "0 seconden" voor een server die net op is, in plaats van niets', async () => {
    antwoord({ ...GEZOND, uptime: 0 });
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('0health.seconds')).toBeInTheDocument();
  });

  it('laat de kleinere eenheden weg bij een ronde looptijd', async () => {
    antwoord({ ...GEZOND, uptime: 7200 });
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('2health.hours')).toBeInTheDocument();
  });

  it('toont het systeem waar de server op draait', async () => {
    antwoord(GEZOND);
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('linux (x64)')).toBeInTheDocument();
    expect(screen.getByText('v22.11.0')).toBeInTheDocument();
    expect(screen.getByText('tutti-web-1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // De belasting wordt op twee cijfers afgerond, anders leest 0.5119999 als ruis.
    expect(screen.getByText('0.51, 0.25, 0.10')).toBeInTheDocument();
  });

  it('toont per dienst de stand, de vertraging en de bijzonderheden', async () => {
    antwoord(GEZOND);
    render(<HealthDashboard />, { wrapper: wikkel });

    const databank = (await screen.findByText('health.database')).closest('.service-card') as HTMLElement;
    expect(within(databank).getByText('health.status.healthy')).toBeInTheDocument();
    expect(within(databank).getByText(/3ms/)).toBeInTheDocument();

    const schijf = screen.getByText('health.disk').closest('.service-card') as HTMLElement;
    expect(within(schijf).getByText('health.details.freeGb')).toBeInTheDocument();
    expect(within(schijf).getByText('42')).toBeInTheDocument();
  });

  it('stuurt het opgeslagen token mee, want dit scherm is niet voor iedereen', async () => {
    localStorage.setItem('token', 'abc.def.ghi');
    antwoord(GEZOND);
    render(<HealthDashboard />, { wrapper: wikkel });

    await screen.findByText('1.12.0');
    expect(vi.mocked(axios.get).mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer abc.def.ghi' },
      withCredentials: true,
    });
  });
});

describe('systeemscherm - als er iets mis is', () => {
  it('zet de melding van een aangeslagen dienst erbij', async () => {
    antwoord({
      ...GEZOND,
      status: 'degraded',
      services: {
        ...GEZOND.services,
        disk: { status: 'degraded', message: 'Nog 4% vrij', details: { freeGb: 4 } },
      },
    });
    render(<HealthDashboard />, { wrapper: wikkel });

    const schijf = (await screen.findByText('health.disk')).closest('.service-card') as HTMLElement;
    expect(within(schijf).getByText('Nog 4% vrij')).toBeInTheDocument();
    expect(within(schijf).getByText('health.status.degraded')).toBeInTheDocument();
  });

  it('toont een ongezonde server gewoon, want een 503 is hier een antwoord', async () => {
    // De aanroep laat 503 door als geldige statuscode. Zou dat niet zo zijn,
    // dan gaf juist de server die het hardst om aandacht vraagt een foutscherm
    // zonder enige aanwijzing.
    antwoord({
      ...GEZOND,
      status: 'unhealthy',
      services: { ...GEZOND.services, database: { status: 'unhealthy', message: 'database is locked' } },
    });
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('database is locked')).toBeInTheDocument();
    // Twee keer: de kop van de pagina en de kaart van de databank.
    expect(screen.getAllByText('health.status.unhealthy')).toHaveLength(2);
    expect(vi.mocked(axios.get).mock.calls[0][1]?.validateStatus?.(503)).toBe(true);
    expect(vi.mocked(axios.get).mock.calls[0][1]?.validateStatus?.(500)).toBe(false);
  });

  it('zegt tegen wie geen beheerder is dat hij er niet bij mag, zonder knop', async () => {
    vi.mocked(axios.get).mockRejectedValue(axiosFout(403));
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('health.adminRequired')).toBeInTheDocument();
    // Opnieuw proberen helpt niet bij te weinig rechten; de knop zou dat wel
    // beloven.
    expect(screen.queryByRole('button', { name: 'health.retry' })).toBeNull();
  });

  it('behandelt een verlopen sessie net zo', async () => {
    vi.mocked(axios.get).mockRejectedValue(axiosFout(401));
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('health.adminRequired')).toBeInTheDocument();
  });

  it('biedt bij een storing wel een nieuwe poging aan', async () => {
    vi.mocked(axios.get).mockRejectedValue(axiosFout(500));
    const gebruiker = userEvent.setup();
    render(<HealthDashboard />, { wrapper: wikkel });

    expect(await screen.findByText('health.errorLoading')).toBeInTheDocument();

    vi.mocked(axios.get).mockResolvedValue({ data: GEZOND });
    await gebruiker.click(screen.getByRole('button', { name: 'health.retry' }));

    expect(await screen.findByText('1.12.0')).toBeInTheDocument();
  });
});

describe('systeemscherm - zelf bijhouden', () => {
  it('haalt de stand opnieuw op als erom gevraagd wordt', async () => {
    antwoord(GEZOND);
    const gebruiker = userEvent.setup();
    render(<HealthDashboard />, { wrapper: wikkel });

    await screen.findByText('1.12.0');
    await gebruiker.click(screen.getByRole('button', { name: 'health.refresh' }));

    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });

  it('laat het tijdvak pas kiezen als automatisch verversen aanstaat', async () => {
    antwoord(GEZOND);
    const gebruiker = userEvent.setup();
    render(<HealthDashboard />, { wrapper: wikkel });

    await screen.findByText('1.12.0');
    expect(screen.queryByRole('combobox')).toBeNull();

    await gebruiker.click(screen.getByRole('checkbox'));

    const keuze = screen.getByRole('combobox') as HTMLSelectElement;
    expect(keuze.value).toBe('30000');
    await gebruiker.selectOptions(keuze, '10000');
    expect(keuze.value).toBe('10000');

    // Uitzetten haalt de keuze weer weg: een keuzelijst die niets meer doet is
    // erger dan geen keuzelijst.
    await gebruiker.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
