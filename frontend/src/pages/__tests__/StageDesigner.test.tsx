/**
 * De podiumindeling: van het overzicht naar de tekentafel en weer terug.
 *
 * StageDesigner.tsx is het scherm waar iemand de stoelopstelling van een
 * concert tekent. Het bestand was nooit getest, terwijl er van alles in zit wat
 * de gebruiker echt doet: een indeling aanmaken, elementen neerzetten en weer
 * weggooien, secties beheren, opslaan, en weglopen met onopgeslagen werk.
 *
 * De tests hieronder gebruiken het echte tekendoek (StageCanvas) in plaats van
 * een namaakversie. Dat is met opzet: het toevoegen van een stoel begint met
 * een klik op het doek en eindigt in de statistieken van de eigenschappenbalk,
 * en juist die overgang is wat er stuk kan gaan. Waar hieronder met
 * muiscoördinaten geklikt wordt geldt hetzelfde als in
 * components/__tests__/StageCanvas.test.tsx: jsdom kent geen opmaak, dus
 * `getBoundingClientRect()` geeft nullen en een klik op clientX 100 komt op
 * doekpunt 100 uit.
 *
 * Wat hier bewust niet getest wordt is het slepen ván een element ín deze
 * pagina; dat staat al bij het doek zelf, waar het thuishoort.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import StageDesigner from '../StageDesigner';
import * as api from '../../api';
import { showError } from '../../utils/toast';
import type { StageLayout, StageLayoutData } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De terugvalwaarde is de Nederlandse tekst die de gebruiker te zien krijgt, en
// die staat in dit scherm overal bij de sleutel. Hem hier gebruiken maakt de
// verwachtingen leesbaar: 'Nieuwe indeling' in plaats van
// 'stageDesigner.newLayout'. Sleutels zonder terugval blijven de sleutel.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string, terugval?: string) => terugval ?? sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`pictogram-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const LEGE_DATA: StageLayoutData = { positions: [], shapes: [], sections: [] };

function indeling(overschrijf: Partial<StageLayout> = {}): StageLayout {
  return {
    id: 'l1',
    name: 'Standaard symfonieorkest',
    description: 'Voor de grote zaal',
    venueName: 'Concertgebouw',
    stageWidth: 1000,
    stageDepth: 600,
    isTemplate: false,
    isDefault: false,
    layoutData: LEGE_DATA,
    thumbnailUrl: null,
    usageCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overschrijf,
  };
}

/** Een mislukte aanroep zoals de api-laag hem doorgeeft: een axiosfout. */
function serverFout(status: number, bericht: string) {
  return { isAxiosError: true, response: { status, data: { error: bericht } } };
}

function zetApiKlaar(): void {
  vi.mocked(api.getStageLayouts).mockResolvedValue([]);
  vi.mocked(api.getStageLayout).mockResolvedValue(indeling());
  vi.mocked(api.getInstruments).mockResolvedValue([]);
  vi.mocked(api.createStageLayout).mockResolvedValue({ id: 'nieuw-1', message: 'ok' });
  vi.mocked(api.updateStageLayout).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.deleteStageLayout).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.duplicateStageLayout).mockResolvedValue({ id: 'kopie-1', message: 'ok' });
}

/** Tekent de pagina, eventueel met een indeling in de adresbalk. */
function toon(zoekreeks = ''): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  function wikkel({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/podium${zoekreeks}`]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  render(<StageDesigner />, { wrapper: wikkel });
}

/** Wacht tot de editor open staat; die verschijnt pas als de indeling binnen is. */
async function wachtOpEditor(): Promise<void> {
  await screen.findByRole('heading', { name: 'Eigenschappen' });
}

/** Het tekendoek van de pagina. */
function doek(): SVGSVGElement {
  const svg = document.querySelector('.stage-canvas-container svg');
  if (!svg) throw new Error('geen tekendoek gevonden');
  return svg as unknown as SVGSVGElement;
}

/** Het getal achter een regel in de statistiekenlijst, bijvoorbeeld 'Posities'. */
function statistiek(naam: string): string {
  const label = screen.getByText(`${naam}:`);
  const regel = label.parentElement!;
  return regel.querySelectorAll('span')[1].textContent ?? '';
}

/** Een knop op zijn zichtbare tekst. */
function knop(tekst: string): HTMLElement {
  return screen.getByRole('button', { name: tekst });
}

/**
 * Een knop binnen het geopende venster.
 *
 * 'Opslaan' staat zowel in de paginakop als in het sectievenster; zonder deze
 * afbakening vindt de zoekopdracht ze allebei.
 */
function vensterknop(tekst: string): HTMLElement {
  const venster = document.querySelector('.modal');
  if (!venster) throw new Error('er staat geen venster open');
  return within(venster as HTMLElement).getByRole('button', { name: tekst });
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('podiumindeling - het overzicht', () => {
  it('toont een skelet zolang de indelingen nog binnenkomen', () => {
    vi.mocked(api.getStageLayouts).mockReturnValue(new Promise(() => {}));

    toon();

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
  });

  it('nodigt uit om te beginnen als er nog geen indelingen zijn', async () => {
    toon();

    expect(await screen.findByText('Nog geen podiumindelingen.')).toBeInTheDocument();
    expect(knop('Maak je eerste indeling')).toBeInTheDocument();
  });

  it('zet de indelingen in een tabel, met kenmerken en gebruik', async () => {
    vi.mocked(api.getStageLayouts).mockResolvedValue([
      indeling({ isDefault: true, isTemplate: true, usageCount: 3 }),
      indeling({ id: 'l2', name: 'Kleine bezetting', venueName: null, description: null, stageWidth: 600 }),
    ]);

    toon();

    expect(await screen.findByText('Standaard symfonieorkest')).toBeInTheDocument();
    expect(screen.getByText('Voor de grote zaal')).toBeInTheDocument();
    expect(screen.getByText('Standaard')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByText('1000 x 600')).toBeInTheDocument();
    expect(screen.getByText('3 concert(en)')).toBeInTheDocument();

    // De tweede indeling heeft geen locatie; daar hoort een streepje.
    const tweedeRij = screen.getByText('Kleine bezetting').closest('tr')!;
    expect(within(tweedeRij).getByText('-')).toBeInTheDocument();
    expect(within(tweedeRij).getByText('0 concert(en)')).toBeInTheDocument();
  });

  it('laat een indeling die in gebruik is niet verwijderen', async () => {
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling({ usageCount: 2 })]);

    toon();

    const rij = (await screen.findByText('Standaard symfonieorkest')).closest('tr')!;
    expect(within(rij).getByRole('button', { name: 'Verwijderen' })).toBeDisabled();
    expect(within(rij).getByRole('button', { name: 'Verwijderen' })).toHaveAttribute(
      'title',
      'Kan niet verwijderen: in gebruik',
    );
  });

  it('verwijdert een ongebruikte indeling na bevestiging', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling()]);

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));

    // De bevestiging staat er; pas de tweede klik verwijdert echt.
    expect(screen.getByText('Weet je zeker dat je deze podiumindeling wilt verwijderen?')).toBeInTheDocument();
    expect(api.deleteStageLayout).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteStageLayout).toHaveBeenCalledWith('l1'));
  });

  it('laat het verwijderen los als de gebruiker de bevestiging afbreekt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling()]);

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('Weet je zeker dat je deze podiumindeling wilt verwijderen?')).not.toBeInTheDocument();
    expect(api.deleteStageLayout).not.toHaveBeenCalled();
  });

  it('dupliceert een indeling en opent de kopie', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling()]);
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({ id: 'kopie-1', name: 'Standaard symfonieorkest (kopie)' }),
    );

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Dupliceren' }));

    await waitFor(() => expect(api.duplicateStageLayout).toHaveBeenCalledWith('l1', undefined));
    // De kopie wordt meteen geopend in de editor.
    await waitFor(() => expect(api.getStageLayout).toHaveBeenCalledWith('kopie-1'));
  });

  it('kan de editor niet openen zolang er geen indeling gekozen is', async () => {
    toon();

    await screen.findByText('Nog geen podiumindelingen.');

    expect(knop('Editor')).toBeDisabled();
  });
});

/**
 * BEWIJS - een mislukte aanvraag las als een lege lijst.
 *
 * `useStageLayouts` meldt een mislukte aanroep niet aan de pagina: bij een
 * fout blijft `data` leeg, en de pagina trok daar de conclusie uit dat er nog
 * geen indelingen bestaan. Wie de server even niet kon bereiken kreeg dus
 * 'Nog geen podiumindelingen' te zien, met een knop om er een te maken - het
 * scherm vertelde hem dat zijn werk weg was.
 *
 * Aangetoond: met StageDesigner.tsx teruggezet op HEAD (`git checkout HEAD --
 * src/pages/StageDesigner.tsx`, alleen dat bestand) viel deze test om met
 * 'Unable to find an element with the text: errors.generic' - het scherm toonde
 * in plaats daarvan de lege toestand. Daarna is het gerepareerde bestand
 * teruggezet.
 */
describe('podiumindeling - het overzicht kan niet opgehaald worden', () => {
  it('meldt de fout in plaats van te doen alsof de lijst leeg is', async () => {
    vi.mocked(api.getStageLayouts).mockRejectedValue(serverFout(500, 'Serverfout'));

    toon();

    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('Nog geen podiumindelingen.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maak je eerste indeling' })).not.toBeInTheDocument();
  });

  it('probeert het opnieuw als de gebruiker daarom vraagt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayouts).mockRejectedValueOnce(serverFout(500, 'Serverfout'));
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling()]);

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText('Standaard symfonieorkest')).toBeInTheDocument();
  });
});

describe('podiumindeling - een nieuwe indeling aanmaken', () => {
  it('vraagt om een naam voordat er iets aangemaakt kan worden', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Maak je eerste indeling' }));

    expect(knop('Aanmaken')).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('bijv. Standaard symfonieorkest'), 'Kerstconcert');

    expect(knop('Aanmaken')).toBeEnabled();
  });

  it('maakt de indeling aan met de ingevulde gegevens en opent hem', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayout).mockResolvedValue(indeling({ id: 'nieuw-1', name: 'Kerstconcert' }));

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Nieuwe indeling' }));
    await gebruiker.type(screen.getByPlaceholderText('bijv. Standaard symfonieorkest'), 'Kerstconcert');
    await gebruiker.type(screen.getByPlaceholderText('bijv. Concertgebouw'), 'Dorpskerk');
    await gebruiker.click(knop('Aanmaken'));

    await waitFor(() =>
      expect(api.createStageLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kerstconcert',
          venueName: 'Dorpskerk',
          stageWidth: 1000,
          stageDepth: 600,
          layoutData: { positions: [], shapes: [], sections: [] },
        }),
      ),
    );

    // De nieuwe indeling wordt meteen geopend.
    await waitFor(() => expect(api.getStageLayout).toHaveBeenCalledWith('nieuw-1'));
    await wachtOpEditor();
  });

  it('houdt het venster open en meldt de fout als het aanmaken mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createStageLayout).mockRejectedValue(serverFout(409, 'Er bestaat al een indeling met deze naam.'));

    toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'Nieuwe indeling' }));
    await gebruiker.type(screen.getByPlaceholderText('bijv. Standaard symfonieorkest'), 'Kerstconcert');
    await gebruiker.click(knop('Aanmaken'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Er bestaat al een indeling met deze naam.'));
    // Het scherm blijft staan met de ingevulde naam, zodat de gebruiker hem kan aanpassen.
    expect(screen.getByPlaceholderText('bijv. Standaard symfonieorkest')).toHaveValue('Kerstconcert');
    expect(screen.getByRole('heading', { name: 'Nieuwe indeling' })).toBeInTheDocument();
  });
});

describe('podiumindeling - de tekentafel', () => {
  it('vult de editor met de opgeslagen gegevens van de indeling', async () => {
    toon('?id=l1');

    await wachtOpEditor();

    expect(screen.getByDisplayValue('Standaard symfonieorkest')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Concertgebouw')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('600')).toBeInTheDocument();
    expect(statistiek('Posities')).toBe('0');
  });

  it('toont een opgeslagen indeling met stoelen en secties terug op het doek', async () => {
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({
        layoutData: {
          positions: [
            { id: 'p1', x: 100, y: 100, type: 'chair', rotation: 0, label: 'Vl1-1', section: 's1' },
            { id: 'p2', x: 160, y: 100, type: 'chair', rotation: 0, label: 'Vl1-2', section: 's1' },
          ],
          shapes: [{ id: 'v1', type: 'rect', x: 200, y: 40, width: 120, height: 60, label: 'Vleugel' }],
          sections: [{ id: 's1', name: 'Violen 1', color: '#4CAF50' }],
        },
      }),
    );

    toon('?id=l1');

    await wachtOpEditor();

    expect(screen.getByRole('button', { name: 'Vl1-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vleugel' })).toBeInTheDocument();
    expect(screen.getByText('Violen 1')).toBeInTheDocument();
    expect(statistiek('Posities')).toBe('2');
    expect(statistiek('Vormen')).toBe('1');
    expect(statistiek('Secties')).toBe('1');
  });

  it('zet een stoel op het podium en haalt hem er weer af', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');

    await wachtOpEditor();
    expect(screen.queryByText('Niet-opgeslagen wijzigingen')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByTitle('Stoel'));
    fireEvent.click(doek(), { clientX: 100, clientY: 100 });

    expect(statistiek('Posities')).toBe('1');
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
    // De nieuwe stoel is geselecteerd, dus zijn eigenschappen staan ernaast.
    expect(screen.getByRole('heading', { name: 'Positie' })).toBeInTheDocument();

    await gebruiker.click(knop('Element verwijderen'));

    expect(statistiek('Posities')).toBe('0');
    expect(screen.queryByRole('heading', { name: 'Positie' })).not.toBeInTheDocument();
  });

  it('geeft een geselecteerde stoel een label en een sectie', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({
        layoutData: {
          positions: [{ id: 'p1', x: 100, y: 100, type: 'chair', rotation: 0 }],
          shapes: [],
          sections: [{ id: 's1', name: 'Violen 1', color: '#4CAF50' }],
        },
      }),
    );

    toon('?id=l1');
    await wachtOpEditor();

    fireEvent.click(screen.getByRole('button', { name: 'chair' }));

    await gebruiker.type(screen.getByPlaceholderText('bijv. Vl1-1'), 'Vl1-3');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 's1');

    // Het label staat nu op het podium zelf.
    expect(screen.getByRole('button', { name: 'Vl1-3' })).toBeInTheDocument();
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
  });

  it('toont bij een vorm de eigenschappen die bij die vorm horen', async () => {
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({
        layoutData: {
          positions: [],
          shapes: [{ id: 'v1', type: 'circle', x: 100, y: 100, radius: 40, label: 'Pauken' }],
          sections: [],
        },
      }),
    );

    toon('?id=l1');
    await wachtOpEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Pauken' }));

    expect(screen.getByRole('heading', { name: 'Vorm' })).toBeInTheDocument();
    expect(screen.getByText('Straal')).toBeInTheDocument();
    // Breedte en hoogte horen bij een rechthoek, niet bij een cirkel. De
    // indelingseigenschappen hebben ze wel, dus er hoort er precies één te zijn.
    expect(screen.getAllByText('Breedte')).toHaveLength(1);
  });

  it('zoomt in en uit binnen de grenzen', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    expect(screen.getByText('100%')).toBeInTheDocument();

    await gebruiker.click(knop('+'));
    expect(screen.getByText('125%')).toBeInTheDocument();

    await gebruiker.click(knop('-'));
    await gebruiker.click(knop('-'));
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('verbergt en toont de eigenschappenbalk', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(knop('Verberg eigenschappen'));
    expect(screen.queryByRole('heading', { name: 'Eigenschappen' })).not.toBeInTheDocument();

    await gebruiker.click(knop('Toon eigenschappen'));
    expect(screen.getByRole('heading', { name: 'Eigenschappen' })).toBeInTheDocument();
  });
});

describe('podiumindeling - secties', () => {
  it('voegt een sectie toe en zet hem in de zijbalk', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getInstruments).mockResolvedValue([{ id: 'i1', name: 'Viool', tuning: null }]);

    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(knop('+ Sectie toevoegen'));
    await gebruiker.type(screen.getByPlaceholderText('bijv. Violen 1'), 'Celli');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'i1');
    await gebruiker.click(vensterknop('Opslaan'));

    expect(screen.getByText('Celli')).toBeInTheDocument();
    expect(statistiek('Secties')).toBe('1');
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
  });

  it('slaat een sectie zonder naam niet op', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(knop('+ Sectie toevoegen'));

    expect(vensterknop('Opslaan')).toBeDisabled();
  });

  it('hernoemt een bestaande sectie', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({ layoutData: { ...LEGE_DATA, sections: [{ id: 's1', name: 'Violen 1', color: '#4CAF50' }] } }),
    );

    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(screen.getByTitle('Bewerken'));
    const naamveld = screen.getByPlaceholderText('bijv. Violen 1');
    await gebruiker.clear(naamveld);
    await gebruiker.type(naamveld, 'Violen 2');
    await gebruiker.click(vensterknop('Opslaan'));

    expect(screen.getByText('Violen 2')).toBeInTheDocument();
    expect(screen.queryByText('Violen 1')).not.toBeInTheDocument();
    expect(statistiek('Secties')).toBe('1');
  });

  it('haalt bij het verwijderen van een sectie de stoelen uit die sectie', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayout).mockResolvedValue(
      indeling({
        layoutData: {
          positions: [{ id: 'p1', x: 100, y: 100, type: 'chair', rotation: 0, label: 'Vl1-1', section: 's1' }],
          shapes: [],
          sections: [{ id: 's1', name: 'Violen 1', color: '#ff0000' }],
        },
      }),
    );

    toon('?id=l1');
    await wachtOpEditor();

    expect(screen.getByRole('button', { name: 'Vl1-1' }).querySelector('rect')!.getAttribute('fill')).toBe('#ff0000');

    await gebruiker.click(screen.getByTitle('Verwijderen'));

    expect(screen.queryByText('Violen 1')).not.toBeInTheDocument();
    expect(statistiek('Secties')).toBe('0');
    // De stoel blijft staan, maar zonder sectiekleur.
    expect(statistiek('Posities')).toBe('1');
    expect(screen.getByRole('button', { name: 'Vl1-1' }).querySelector('rect')!.getAttribute('fill')).toBe('#cccccc');
  });
});

describe('podiumindeling - opslaan', () => {
  it('slaat pas op als er iets gewijzigd is', async () => {
    toon('?id=l1');
    await wachtOpEditor();

    expect(knop('Opslaan')).toBeDisabled();
  });

  it('bewaart een toegevoegde stoel en toont hem terug bij een volgend bezoek', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(screen.getByTitle('Stoel'));
    fireEvent.click(doek(), { clientX: 120, clientY: 80 });
    await gebruiker.click(knop('Opslaan'));

    await waitFor(() => expect(api.updateStageLayout).toHaveBeenCalled());

    const [id, verstuurd] = vi.mocked(api.updateStageLayout).mock.calls[0];
    expect(id).toBe('l1');
    expect(verstuurd.name).toBe('Standaard symfonieorkest');
    expect(verstuurd.layoutData!.positions).toHaveLength(1);
    expect(verstuurd.layoutData!.positions[0]).toMatchObject({ type: 'chair', x: 120, y: 80 });

    // De melding over onopgeslagen werk is weg zodra het opslaan gelukt is.
    await waitFor(() => expect(screen.queryByText('Niet-opgeslagen wijzigingen')).not.toBeInTheDocument());

    // Wat opgeslagen is komt bij een volgend bezoek terug op het doek.
    cleanup();
    vi.mocked(api.getStageLayout).mockResolvedValue(indeling({ layoutData: verstuurd.layoutData }));
    toon('?id=l1');
    await wachtOpEditor();
    expect(screen.getByRole('button', { name: 'chair' })).toBeInTheDocument();
    expect(statistiek('Posities')).toBe('1');
  });

  it('slaat een gewijzigde naam en afmeting op', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    const naamveld = screen.getByDisplayValue('Standaard symfonieorkest');
    await gebruiker.clear(naamveld);
    await gebruiker.type(naamveld, 'Grote bezetting');
    await gebruiker.click(knop('Opslaan'));

    await waitFor(() =>
      expect(api.updateStageLayout).toHaveBeenCalledWith('l1', expect.objectContaining({ name: 'Grote bezetting' })),
    );
  });

  it('meldt een mislukte opslag en houdt de wijziging vast', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateStageLayout).mockRejectedValue(serverFout(500, 'Opslaan is mislukt.'));

    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(screen.getByTitle('Stoel'));
    fireEvent.click(doek(), { clientX: 120, clientY: 80 });
    await gebruiker.click(knop('Opslaan'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Opslaan is mislukt.'));
    // Het werk staat er nog, en de pagina blijft gewoon staan.
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
    expect(statistiek('Posities')).toBe('1');
  });

  it('waarschuwt voordat onopgeslagen werk verloren gaat', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(screen.getByTitle('Stoel'));
    fireEvent.click(doek(), { clientX: 120, clientY: 80 });
    await gebruiker.click(knop('Terug'));

    expect(screen.getByText('Wijzigingen negeren?')).toBeInTheDocument();

    // Afbreken houdt de gebruiker in de editor, met zijn stoel.
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(statistiek('Posities')).toBe('1');

    // Doorzetten brengt hem terug naar het overzicht.
    await gebruiker.click(knop('Terug'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.confirm' }));

    expect(await screen.findByText('Nog geen podiumindelingen.')).toBeInTheDocument();
  });

  it('gaat zonder waarschuwing terug als er niets gewijzigd is', async () => {
    const gebruiker = userEvent.setup();
    toon('?id=l1');
    await wachtOpEditor();

    await gebruiker.click(knop('Terug'));

    expect(screen.queryByText('Wijzigingen negeren?')).not.toBeInTheDocument();
    expect(await screen.findByText('Nog geen podiumindelingen.')).toBeInTheDocument();
  });
});

/**
 * BEWIJS - een indeling van een andere vereniging gaf een doodlopend scherm.
 *
 * De server zoekt een indeling altijd binnen de vereniging van de ingelogde
 * gebruiker (`WHERE sl.id = ? AND sl.association_id = ?`), en geeft 404 als hij
 * hem daar niet vindt. Een gedeelde of gebladwijzerde koppeling naar een
 * indeling van een andere vereniging kwam dus met een fout terug - en de pagina
 * deed daar niets mee. De gebruiker bleef op het overzicht staan zonder
 * uitleg, terwijl het tabblad Editor aanklikbaar was en bij een klik niets
 * deed.
 *
 * Aangetoond: met StageDesigner.tsx teruggezet op HEAD (`git checkout HEAD --
 * src/pages/StageDesigner.tsx`, alleen dat bestand) vielen beide tests om -
 * de melding stond nergens op het scherm, en het tabblad Editor was niet
 * uitgeschakeld. Daarna is het gerepareerde bestand teruggezet.
 */
describe('podiumindeling - een indeling van een andere vereniging', () => {
  beforeEach(() => {
    vi.mocked(api.getStageLayout).mockRejectedValue(serverFout(404, 'Podiumindeling niet gevonden.'));
  });

  it('vertelt waarom de indeling niet te zien is', async () => {
    toon('?id=van-een-andere-vereniging');

    expect(await screen.findByText('Podiumindeling niet gevonden.')).toBeInTheDocument();
  });

  it('laat het tabblad Editor niet openstaan naar iets wat er niet is', async () => {
    toon('?id=van-een-andere-vereniging');

    await screen.findByText('Podiumindeling niet gevonden.');

    expect(knop('Editor')).toBeDisabled();
  });

  it('brengt de gebruiker met één klik terug naar zijn eigen indelingen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getStageLayouts).mockResolvedValue([indeling()]);

    toon('?id=van-een-andere-vereniging');

    await screen.findByText('Podiumindeling niet gevonden.');
    await gebruiker.click(knop('Terug'));

    await waitFor(() => expect(screen.queryByText('Podiumindeling niet gevonden.')).not.toBeInTheDocument());
    expect(screen.getByText('Standaard symfonieorkest')).toBeInTheDocument();
  });
});
