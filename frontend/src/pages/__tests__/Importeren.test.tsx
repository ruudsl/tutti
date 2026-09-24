/**
 * De importpagina: bestand kiezen, per regel zien wat er gebeurt, importeren.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Importeren from '../Importeren';
import * as api from '../../api/importeren';
import type { ImportVoorbeeld, LidGegevens } from '../../api/importeren';

vi.mock('../../api/importeren');
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

const gebruiker = vi.hoisted(() => ({ rol: 'admin' }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: gebruiker.rol } }),
}));

// `t` geeft de sleutel terug, met de waarden erachter als die er zijn.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const VOORBEELD: ImportVoorbeeld<LidGegevens> = {
  kolommen: { voornaam: 'Voornaam', achternaam: 'Achternaam', email: 'E-mail' },
  genegeerd: ['Telefoon'],
  regels: [
    {
      rij: 2,
      status: 'nieuw',
      gegevens: {
        voornaam: 'Anna',
        achternaam: 'Jansen',
        email: 'anna@voorbeeld.nl',
        rol: 'member',
        instrumenten: ['Trompet'],
        orkesten: [],
        priveEmail: null,
      },
      fouten: [],
      waarschuwingen: ['Instrument "Tuba" is niet gevonden en wordt overgeslagen.'],
    },
    {
      rij: 3,
      status: 'fout',
      gegevens: {
        voornaam: '',
        achternaam: 'Zonder',
        email: 'zonder@voorbeeld.nl',
        rol: 'member',
        instrumenten: [],
        orkesten: [],
        priveEmail: null,
      },
      fouten: ['Voornaam ontbreekt.'],
      waarschuwingen: [],
    },
  ],
  tellingen: { nieuw: 1, bestaat: 0, fout: 1 },
};

const CSV = 'Voornaam;Achternaam;E-mail;Telefoon\nAnna;Jansen;anna@voorbeeld.nl;\n;Zonder;zonder@voorbeeld.nl;\n';

function toon() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Importeren />
    </QueryClientProvider>,
  );
}

async function kiesBestand(inhoud = CSV) {
  const bestand = new File([inhoud], 'leden.csv', { type: 'text/csv' });
  await userEvent.upload(screen.getByLabelText('importeren.kiesBestand'), bestand);
}

describe('de importpagina', () => {
  beforeEach(() => {
    gebruiker.rol = 'admin';
    vi.mocked(api.bekijkImport).mockReset();
    vi.mocked(api.voerImportUit).mockReset();
  });

  it('toont na het kiezen van een bestand per regel wat er gebeurt, zonder te importeren', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue(VOORBEELD);
    toon();

    await kiesBestand();

    expect(await screen.findByText('anna@voorbeeld.nl')).toBeInTheDocument();
    expect(api.bekijkImport).toHaveBeenCalledWith('leden', CSV);
    expect(api.voerImportUit).not.toHaveBeenCalled();
    expect(screen.getByText('Voornaam ontbreekt.')).toBeInTheDocument();
    expect(screen.getByText('Instrument "Tuba" is niet gevonden en wordt overgeslagen.')).toBeInTheDocument();
    expect(screen.getByText(/importeren\.genegeerd.*Telefoon/)).toBeInTheDocument();
  });

  it('importeert hetzelfde bestand en meldt het resultaat', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue(VOORBEELD);
    vi.mocked(api.voerImportUit).mockResolvedValue({ ...VOORBEELD, geimporteerd: 1 });
    toon();

    await kiesBestand();
    await userEvent.click(await screen.findByRole('button', { name: /importeren\.importeer/ }));

    expect(api.voerImportUit).toHaveBeenCalledWith('leden', CSV);
    const melding = await screen.findByRole('status');
    expect(melding).toHaveTextContent('importeren.gelukt {"count":1}');
    expect(within(melding).getByText('importeren.wachtwoord')).toBeInTheDocument();
  });

  it('laat de importknop uit als er niets nieuws is', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue({ ...VOORBEELD, tellingen: { nieuw: 0, bestaat: 1, fout: 1 } });
    toon();

    await kiesBestand();

    expect(await screen.findByRole('button', { name: /importeren\.importeer/ })).toBeDisabled();
  });

  it('toont de weigering van de server', async () => {
    vi.mocked(api.bekijkImport).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'Deze kolommen ontbreken in het bestand: email.' } },
    });
    toon();

    await kiesBestand();

    expect(await screen.findByRole('alert')).toHaveTextContent('Deze kolommen ontbreken in het bestand: email.');
  });

  it('laat de muziekcommissie alleen de muziekbibliotheek importeren', async () => {
    gebruiker.rol = 'music_committee';
    vi.mocked(api.bekijkImport).mockResolvedValue({ ...VOORBEELD, regels: [] });
    toon();

    expect(screen.queryByRole('button', { name: 'importeren.soorten.leden' })).not.toBeInTheDocument();
    await kiesBestand('Titel\nBolero\n');
    expect(api.bekijkImport).toHaveBeenCalledWith('muziektitels', 'Titel\nBolero\n');
  });
});
