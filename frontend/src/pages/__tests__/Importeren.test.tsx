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

const gebruiker = vi.hoisted(() => ({ rol: 'admin', modules: ['inventory', 'contacts'] as string[] }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: gebruiker.rol } }),
}));
vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({ isEnabled: (sleutel: string) => gebruiker.modules.includes(sleutel) }),
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
  tellingen: { nieuw: 1, bestaat: 0, bijwerken: 0, fout: 1 },
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
    gebruiker.modules = ['inventory', 'contacts'];
    vi.mocked(api.bekijkImport).mockReset();
    vi.mocked(api.voerImportUit).mockReset();
  });

  it('toont na het kiezen van een bestand per regel wat er gebeurt, zonder te importeren', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue(VOORBEELD);
    toon();

    await kiesBestand();

    expect(await screen.findByText('anna@voorbeeld.nl')).toBeInTheDocument();
    expect(api.bekijkImport).toHaveBeenCalledWith('leden', CSV, { bijwerken: false });
    expect(api.voerImportUit).not.toHaveBeenCalled();
    expect(screen.getByText('Voornaam ontbreekt.')).toBeInTheDocument();
    expect(screen.getByText('Instrument "Tuba" is niet gevonden en wordt overgeslagen.')).toBeInTheDocument();
    expect(screen.getByText(/importeren\.genegeerd.*Telefoon/)).toBeInTheDocument();
  });

  it('importeert hetzelfde bestand en meldt het resultaat', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue(VOORBEELD);
    vi.mocked(api.voerImportUit).mockResolvedValue({ ...VOORBEELD, geimporteerd: 1, bijgewerkt: 0 });
    toon();

    await kiesBestand();
    await userEvent.click(await screen.findByRole('button', { name: /importeren\.importeer/ }));

    expect(api.voerImportUit).toHaveBeenCalledWith('leden', CSV, { bijwerken: false });
    const melding = await screen.findByRole('status');
    expect(melding).toHaveTextContent('importeren.gelukt {"count":1}');
    expect(within(melding).getByText('importeren.wachtwoord')).toBeInTheDocument();
  });

  it('laat de importknop uit als er niets nieuws is', async () => {
    vi.mocked(api.bekijkImport).mockResolvedValue({
      ...VOORBEELD,
      tellingen: { nieuw: 0, bestaat: 1, bijwerken: 0, fout: 1 },
    });
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

  it('werkt bestaande leden bij als dat aangevinkt is, en toont per veld oud en nieuw', async () => {
    const bijTeWerken: ImportVoorbeeld<LidGegevens> = {
      ...VOORBEELD,
      regels: [
        {
          ...VOORBEELD.regels[0],
          status: 'bijwerken',
          waarschuwingen: [],
          wijzigingen: [{ veld: 'achternaam', oud: 'Jansen', nieuw: 'Jansen-de Vries' }],
        },
      ],
      tellingen: { nieuw: 0, bestaat: 0, bijwerken: 1, fout: 0 },
    };
    vi.mocked(api.bekijkImport).mockImplementation(async (_soort, _csv, opties) =>
      opties?.bijwerken ? bijTeWerken : { ...VOORBEELD, tellingen: { nieuw: 0, bestaat: 1, bijwerken: 0, fout: 1 } },
    );
    vi.mocked(api.voerImportUit).mockResolvedValue({ ...bijTeWerken, geimporteerd: 0, bijgewerkt: 1 });
    toon();

    await kiesBestand();
    // Zonder de optie is er niets te doen.
    expect(await screen.findByRole('button', { name: /importeren\.importeer/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'importeren.bijwerken' }));

    expect(api.bekijkImport).toHaveBeenLastCalledWith('leden', CSV, { bijwerken: true });
    expect(await screen.findByText('importeren.veld.achternaam: Jansen → Jansen-de Vries')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /importeren\.importeer/ }));

    expect(api.voerImportUit).toHaveBeenCalledWith('leden', CSV, { bijwerken: true });
    expect(await screen.findByRole('status')).toHaveTextContent('importeren.bijgewerkt {"count":1}');
  });

  /** De knoppen om een soort te kiezen, in volgorde. */
  const soorten = () =>
    screen.queryAllByRole('button', { name: /^importeren\.soorten\./ }).map((knop) => knop.textContent);

  it('laat de beheerder alle soorten kiezen als de modules aan staan', () => {
    toon();
    expect(soorten()).toEqual([
      'importeren.soorten.leden',
      'importeren.soorten.muziektitels',
      'importeren.soorten.instrumenten',
      'importeren.soorten.contacten',
      'importeren.soorten.uniformen',
      'importeren.soorten.apparatuur',
    ]);
  });

  it('biedt instrumenten, contacten, uniformen en apparatuur niet aan als hun module uit staat', () => {
    gebruiker.modules = [];
    toon();
    expect(soorten()).toEqual(['importeren.soorten.leden', 'importeren.soorten.muziektitels']);
  });

  it('laat de muziekcommissie de muziekbibliotheek en contacten importeren, geen leden', async () => {
    gebruiker.rol = 'music_committee';
    vi.mocked(api.bekijkImport).mockResolvedValue({ ...VOORBEELD, regels: [] });
    toon();

    expect(soorten()).toEqual(['importeren.soorten.muziektitels', 'importeren.soorten.contacten']);
    await kiesBestand('Titel\nBolero\n');
    expect(api.bekijkImport).toHaveBeenCalledWith('muziektitels', 'Titel\nBolero\n', { bijwerken: false });
  });

  it('laat de uniformcommissie alleen uniformen importeren, met drager en het deel dat nieuw is', async () => {
    gebruiker.rol = 'uniforms_committee';
    vi.mocked(api.bekijkImport).mockResolvedValue({
      kolommen: { soort: 'Soort' },
      genegeerd: [],
      regels: [
        {
          rij: 2,
          status: 'nieuw',
          gegevens: {
            soort: 'jacket',
            maat: '52',
            lengte: null,
            wijdte: null,
            kleur: 'Rood',
            aantal: 4,
            toeTeVoegen: 2,
            staat: 'good',
            status: 'available',
            uitgegevenAan: null,
            uitgiftedatum: null,
            aankoopdatum: null,
            aankoopprijs: null,
            opmerkingen: null,
          },
          fouten: [],
          waarschuwingen: [],
        },
        {
          rij: 3,
          status: 'nieuw',
          gegevens: {
            soort: 'pants',
            maat: null,
            lengte: 84,
            wijdte: 32,
            kleur: null,
            aantal: 1,
            toeTeVoegen: 1,
            staat: 'good',
            status: 'issued',
            uitgegevenAan: 'anna@voorbeeld.nl',
            uitgiftedatum: '2024-09-01',
            aankoopdatum: null,
            aankoopprijs: null,
            opmerkingen: null,
          },
          fouten: [],
          waarschuwingen: [],
        },
      ],
      tellingen: { nieuw: 2, bestaat: 0, bijwerken: 0, fout: 0 },
    } as never);
    toon();

    expect(soorten()).toEqual([]);
    await kiesBestand('Soort\nJas\n');

    expect(api.bekijkImport).toHaveBeenCalledWith('uniformen', 'Soort\nJas\n', { bijwerken: false });
    // Uniformen hebben geen sleutel: bijwerken kan niet.
    expect(screen.queryByRole('checkbox', { name: 'importeren.bijwerken' })).not.toBeInTheDocument();
    expect(await screen.findByText('uniforms.itemTypes.jacket')).toBeInTheDocument();
    expect(screen.getByText('importeren.aantalVan {"nieuw":2,"aantal":4}')).toBeInTheDocument();
    expect(screen.getByText('84/32')).toBeInTheDocument();
    expect(screen.getByText('anna@voorbeeld.nl')).toBeInTheDocument();
    expect(screen.getByText('uniforms.status.issued')).toBeInTheDocument();
  });

  it('laat de materiaalcommissie instrumenten en apparatuur importeren', () => {
    gebruiker.rol = 'equipment_committee';
    toon();

    expect(soorten()).toEqual(['importeren.soorten.instrumenten', 'importeren.soorten.apparatuur']);
  });

  it('begint voor de materiaalcommissie bij de instrumenten, en toont de status in woorden', async () => {
    gebruiker.rol = 'equipment_committee';
    vi.mocked(api.bekijkImport).mockResolvedValue({
      kolommen: { naam: 'Naam', soort: 'Soort' },
      genegeerd: [],
      regels: [
        {
          rij: 2,
          status: 'nieuw',
          gegevens: {
            naam: 'Trompet 1',
            soort: 'Trompet',
            categorie: 'brass',
            merk: 'Yamaha',
            model: null,
            serienummer: 'YTR-123',
            bouwjaar: null,
            aankoopdatum: null,
            aankoopprijs: null,
            waarde: null,
            status: 'on_loan',
            staat: 'good',
            locatie: null,
            opmerkingen: null,
          },
          fouten: [],
          waarschuwingen: [],
        },
      ],
      tellingen: { nieuw: 1, bestaat: 0, bijwerken: 0, fout: 0 },
    } as never);
    toon();

    await kiesBestand('Naam;Soort\nTrompet 1;Trompet\n');

    expect(api.bekijkImport).toHaveBeenCalledWith('instrumenten', 'Naam;Soort\nTrompet 1;Trompet\n', {
      bijwerken: false,
    });
    expect(await screen.findByText('YTR-123')).toBeInTheDocument();
    expect(screen.getByText('importeren.instrumentStatus.on_loan')).toBeInTheDocument();
  });
});
