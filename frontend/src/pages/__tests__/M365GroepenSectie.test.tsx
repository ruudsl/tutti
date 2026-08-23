/**
 * De sectie in de instellingen die orkesten aan Microsoft 365-groepen koppelt.
 *
 * Wie geen Microsoft gebruikt hoort van deze sectie niets te merken - dat is
 * de meeste verenigingen. Dat is niet alleen een kwestie van niets tonen: de
 * lijst met koppelingen hoort dan ook niet opgehaald te worden. Die twee dingen
 * hangen aan dezelfde vlag, en dat staat hier vast.
 *
 * Verder wordt getest wat de beheerder ziet en doet: de koppelingen met hun
 * soort, een koppeling toevoegen waarbij alleen de nog vrije orkesten te kiezen
 * zijn en er maar één slagwerkgroep kan bestaan, hernoemen, verwijderen, en wat
 * er gebeurt als de server nee zegt.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { M365GroepenSectie } from '../Settings/M365GroepenSectie';
import {
  getM365GroupMappings,
  createM365GroupMapping,
  updateM365GroupMapping,
  deleteM365GroupMapping,
  type M365GroupMapping,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api', () => ({
  getM365GroupMappings: vi.fn(),
  createM365GroupMapping: vi.fn(),
  updateM365GroupMapping: vi.fn(),
  deleteM365GroupMapping: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties.groupName === 'string' ? `${sleutel}:${opties.groupName}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const orkesten = vi.hoisted(() => ({
  lijst: [] as { id: string; name: string }[],
}));
vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: orkesten.lijst, isLoading: false }),
}));

const koppelingenOphalen = vi.mocked(getM365GroupMappings);
const aanmaken = vi.mocked(createM365GroupMapping);
const bijwerken = vi.mocked(updateM365GroupMapping);
const verwijderen = vi.mocked(deleteM365GroupMapping);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

function koppeling(overschrijving: Partial<M365GroupMapping> & { id: string; groupName: string }): M365GroupMapping {
  return { orchestraId: null, orchestraName: null, groupType: 'orchestra', ...overschrijving };
}

const KOPPELINGEN = [
  koppeling({
    id: 'kop-1',
    groupName: 'harmonie@vereniging.nl',
    groupType: 'orchestra',
    orchestraId: 'ork-1',
    orchestraName: 'Harmonieorkest',
  }),
  koppeling({ id: 'kop-2', groupName: 'slagwerk@vereniging.nl', groupType: 'percussion' }),
];

const ORKESTEN = [
  { id: 'ork-1', name: 'Harmonieorkest' },
  { id: 'ork-2', name: 'Opleidingsorkest' },
];

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(microsoftIngesteld = true) {
  render(<M365GroepenSectie microsoftIngesteld={microsoftIngesteld} />, { wrapper: Omhulsel });
}

/** Opent het toevoegvenster en geeft dat venster terug. */
async function openToevoegen(bediener: ReturnType<typeof userEvent.setup>) {
  await bediener.click(await screen.findByRole('button', { name: '+ settings.m365Groups.add' }));
  return await screen.findByRole('dialog');
}

/** Opent het bewerkvenster van een koppeling en geeft dat venster terug. */
async function openBewerken(bediener: ReturnType<typeof userEvent.setup>, groepsnaam: string) {
  const rij = (await screen.findByText(groepsnaam)).closest('tr')!;
  await bediener.click(within(rij).getByRole('button', { name: 'common.edit' }));
  return await screen.findByRole('dialog');
}

function groepsnaamveld(venster: HTMLElement) {
  return within(venster).getByLabelText(/settings\.m365Groups\.groupName/);
}

beforeEach(() => {
  vi.clearAllMocks();
  orkesten.lijst = ORKESTEN;
  koppelingenOphalen.mockResolvedValue(KOPPELINGEN);
  aanmaken.mockResolvedValue({ id: 'kop-3', message: 'ok' } as never);
  bijwerken.mockResolvedValue({ message: 'ok' });
  verwijderen.mockResolvedValue({ message: 'ok' });
});

describe('M365GroepenSectie, zonder Microsoft', () => {
  /**
   * WACHT, geen bewijs: deze test is ook groen op de code van vóór het
   * herontwerp dat in de kop van het bestand beschreven staat, want daar viel
   * hij pas op als je de zes queries van de instellingenpagina samen bekeek.
   * Hij houdt vast dat het niet-tonen en het niet-ophalen aan dezelfde vlag
   * hangen, zodat ze niet uit elkaar kunnen lopen.
   */
  it('toont niets en haalt ook niets op', async () => {
    const { container } = render(<M365GroepenSectie microsoftIngesteld={false} />, { wrapper: Omhulsel });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(koppelingenOphalen).not.toHaveBeenCalled();
  });
});

describe('M365GroepenSectie, de lijst', () => {
  it('toont eerst dat er geladen wordt', async () => {
    koppelingenOphalen.mockImplementation(() => new Promise(() => {}));
    toon();

    expect(await screen.findByText('common.loading')).toBeInTheDocument();
  });

  it('toont elke koppeling met haar soort en het orkest', async () => {
    toon();

    const orkestrij = (await screen.findByText('harmonie@vereniging.nl')).closest('tr')!;
    expect(within(orkestrij).getByText('settings.m365Groups.typeOrchestra')).toBeInTheDocument();
    expect(within(orkestrij).getByText('Harmonieorkest')).toBeInTheDocument();

    const slagwerkrij = screen.getByText('slagwerk@vereniging.nl').closest('tr')!;
    expect(within(slagwerkrij).getByText('settings.m365Groups.typePercussion')).toBeInTheDocument();
    // Een slagwerkgroep hangt aan geen enkel orkest; dat blijft een streepje.
    expect(within(slagwerkrij).getByText('-')).toBeInTheDocument();
  });

  it('geeft een groep van een eigen soort haar eigen aanduiding', async () => {
    koppelingenOphalen.mockResolvedValueOnce([
      koppeling({ id: 'kop-9', groupName: 'bestuur@vereniging.nl', groupType: 'special' }),
    ]);
    toon();

    const rij = (await screen.findByText('bestuur@vereniging.nl')).closest('tr')!;
    expect(within(rij).getByText('settings.m365Groups.typeSpecial')).toBeInTheDocument();
  });

  it('meldt het als er nog geen koppelingen zijn', async () => {
    koppelingenOphalen.mockResolvedValueOnce([]);
    toon();

    expect(await screen.findByText('settings.m365Groups.noMappings')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('M365GroepenSectie, een koppeling toevoegen', () => {
  it('biedt alleen orkesten aan die nog geen koppeling hebben', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');

    const venster = await openToevoegen(bediener);

    const orkestkeuze = within(venster).getByLabelText(/settings\.m365Groups\.orchestra/);
    expect(within(orkestkeuze).getByRole('option', { name: 'Opleidingsorkest' })).toBeInTheDocument();
    expect(within(orkestkeuze).queryByRole('option', { name: 'Harmonieorkest' })).not.toBeInTheDocument();
  });

  it('houdt een tweede slagwerkgroep buiten bereik', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('slagwerk@vereniging.nl');

    const venster = await openToevoegen(bediener);

    expect(within(venster).getByRole('option', { name: 'settings.m365Groups.typePercussion' })).toBeDisabled();
  });

  it('laat een slagwerkgroep wél kiezen zolang er nog geen is', async () => {
    koppelingenOphalen.mockResolvedValueOnce([KOPPELINGEN[0]]);
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');

    const venster = await openToevoegen(bediener);

    expect(within(venster).getByRole('option', { name: 'settings.m365Groups.typePercussion' })).toBeEnabled();
  });

  it('koppelt een orkest aan een groepsnaam', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);

    await bediener.selectOptions(within(venster).getByLabelText(/settings\.m365Groups\.orchestra/), 'ork-2');
    await bediener.type(groepsnaamveld(venster), '  opleiding@vereniging.nl  ');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(aanmaken).toHaveBeenCalledWith({
        orchestraId: 'ork-2',
        // Spaties eromheen zijn een typfout, geen onderdeel van de naam.
        groupName: 'opleiding@vereniging.nl',
        groupType: 'orchestra',
      }),
    );
    expect(succes).toHaveBeenCalledWith('settings.m365Groups.created');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('laat het orkest weg zodra de soort geen orkest meer is', async () => {
    koppelingenOphalen.mockResolvedValueOnce([KOPPELINGEN[0]]);
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);

    await bediener.selectOptions(within(venster).getByLabelText(/settings\.m365Groups\.type/), 'percussion');
    // De orkestkeuze hoort dan te verdwijnen, want een slagwerkgroep hangt aan
    // geen enkel orkest.
    expect(within(venster).queryByLabelText(/settings\.m365Groups\.orchestra/)).not.toBeInTheDocument();

    await bediener.type(groepsnaamveld(venster), 'slagwerk@vereniging.nl');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(aanmaken).toHaveBeenCalledWith({
        orchestraId: undefined,
        groupName: 'slagwerk@vereniging.nl',
        groupType: 'percussion',
      }),
    );
  });

  it('weigert een groepsnaam die alleen uit spaties bestaat', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);

    await bediener.type(groepsnaamveld(venster), '   ');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('settings.m365Groups.groupNameRequired'));
    expect(aanmaken).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toont de reden van de server als aanmaken mislukt', async () => {
    aanmaken.mockRejectedValueOnce({ response: { data: { error: 'Groep bestaat niet in Microsoft 365' } } });
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);

    await bediener.type(groepsnaamveld(venster), 'nieuw@vereniging.nl');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Groep bestaat niet in Microsoft 365'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    aanmaken.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);

    await bediener.type(groepsnaamveld(venster), 'nieuw@vereniging.nl');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('settings.m365Groups.errorCreating'));
  });

  it('laat het formulier leeg achter als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('harmonie@vereniging.nl');
    const venster = await openToevoegen(bediener);
    await bediener.type(groepsnaamveld(venster), 'nieuw@vereniging.nl');

    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const opnieuw = await openToevoegen(bediener);
    expect(groepsnaamveld(opnieuw)).toHaveValue('');
    expect(aanmaken).not.toHaveBeenCalled();
  });
});

describe('M365GroepenSectie, een koppeling bewerken', () => {
  it('opent met de bestaande groepsnaam en zonder de keuzes die vastliggen', async () => {
    const bediener = userEvent.setup();
    toon();

    const venster = await openBewerken(bediener, 'harmonie@vereniging.nl');

    expect(groepsnaamveld(venster)).toHaveValue('harmonie@vereniging.nl');
    // Soort en orkest liggen bij een bestaande koppeling vast.
    expect(within(venster).queryByLabelText(/settings\.m365Groups\.type/)).not.toBeInTheDocument();
    expect(within(venster).queryByLabelText(/settings\.m365Groups\.orchestra/)).not.toBeInTheDocument();
  });

  it('stuurt de nieuwe groepsnaam naar de server', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'harmonie@vereniging.nl');

    await bediener.clear(groepsnaamveld(venster));
    await bediener.type(groepsnaamveld(venster), 'harmonieorkest@vereniging.nl');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bijwerken).toHaveBeenCalledWith('kop-1', 'harmonieorkest@vereniging.nl'));
    expect(succes).toHaveBeenCalledWith('settings.m365Groups.updated');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('weigert een lege groepsnaam', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'harmonie@vereniging.nl');

    await bediener.clear(groepsnaamveld(venster));
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('settings.m365Groups.groupNameRequired'));
    expect(bijwerken).not.toHaveBeenCalled();
  });

  it('toont de reden van de server als bijwerken mislukt', async () => {
    bijwerken.mockRejectedValueOnce({ response: { data: { error: 'Groep niet gevonden' } } });
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'harmonie@vereniging.nl');

    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Groep niet gevonden'));
  });
});

describe('M365GroepenSectie, een koppeling verwijderen', () => {
  /** Klikt op verwijderen bij een koppeling en geeft de bevestiging terug. */
  async function vraagVerwijderen(bediener: ReturnType<typeof userEvent.setup>, groepsnaam: string) {
    const rij = (await screen.findByText(groepsnaam)).closest('tr')!;
    await bediener.click(within(rij).getByRole('button', { name: 'common.delete' }));
    return await screen.findByRole('alertdialog');
  }

  it('vraagt eerst om bevestiging, met de groepsnaam erbij', async () => {
    const bediener = userEvent.setup();
    toon();

    const bevestiging = await vraagVerwijderen(bediener, 'harmonie@vereniging.nl');

    expect(bevestiging).toHaveTextContent('settings.m365Groups.deleteConfirm:harmonie@vereniging.nl');
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('verwijdert na bevestiging', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'harmonie@vereniging.nl');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verwijderen).toHaveBeenCalledWith('kop-1'));
    expect(succes).toHaveBeenCalledWith('settings.m365Groups.deleted');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('verwijdert niets als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'harmonie@vereniging.nl');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('toont de reden van de server als verwijderen mislukt', async () => {
    verwijderen.mockRejectedValueOnce({ response: { data: { error: 'Koppeling is nog in gebruik' } } });
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'harmonie@vereniging.nl');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Koppeling is nog in gebruik'));
  });
});
