/**
 * De labels van het lijstenbeheer horen bij hun veld.
 *
 * In de twee vensters (nieuwe lijst, lijst hernoemen) stonden label en veld los
 * naast elkaar in dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een
 * schermlezer meldde dan een bewerkbaar veld zonder te zeggen wat erin moet, en
 * een test kon het veld niet op naam vinden. Alle acht velden lopen nu via
 * `FormField`; deze tests zoeken ze op hun labeltekst op.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import MusicListManager from '../MusicListManager';
import * as api from '../../api';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

/**
 * Alles wat de pagina ophaalt loopt via de api-barrel. Eén orkest met één lijst
 * is genoeg: het gaat hier om de vensters, niet om de inhoud.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(api.getOrchestras).mockResolvedValue([{ id: 'orkest-1', name: 'Harmonie' }] as never);
  vi.mocked(api.getGenres).mockResolvedValue([]);
  vi.mocked(api.getMusicLists).mockResolvedValue([
    { id: 'lijst-1', name: 'Voorjaarsconcert', listType: 'regular' },
  ] as never);
  vi.mocked(api.getMusicTitles).mockResolvedValue([]);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Opent het venster "nieuwe lijst" via de plusknop in de lijstenkaart. */
async function openNieuweLijst() {
  const gebruiker = userEvent.setup();
  render(<MusicListManager />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: '+' }));
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('lijstenbeheer - labels gekoppeld aan hun veld', () => {
  it('vindt naam en soort van een nieuwe lijst op hun labeltekst', async () => {
    await openNieuweLijst();

    expect(screen.getByLabelText('common.name')).toHaveValue('');
    expect(screen.getByLabelText('lists.listType').tagName).toBe('SELECT');
  });

  it('vindt ook de concertvelden die pas bij het soort "concert" verschijnen', async () => {
    const gebruiker = await openNieuweLijst();

    await gebruiker.selectOptions(screen.getByLabelText('lists.listType'), 'concert');

    expect(screen.getByLabelText('lists.concertDate')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('lists.concertLocation')).toBeInTheDocument();
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const gebruiker = await openNieuweLijst();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet.
    await gebruiker.click(screen.getByText('common.name'));
    await gebruiker.keyboard('Kerstconcert');

    expect(screen.getByLabelText('common.name')).toHaveValue('Kerstconcert');
  });

  it('koppelt de velden in het hernoemvenster net zo', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'lists.rename' }));

    expect(screen.getByLabelText('common.name')).toHaveValue('Voorjaarsconcert');
    expect(screen.getByLabelText('lists.listType').tagName).toBe('SELECT');
  });
});
