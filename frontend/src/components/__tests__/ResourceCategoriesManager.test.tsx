/**
 * Het beheer van categorieën voor middelen (zalen, bussen, apparatuur).
 *
 * De volgorde van deze categorieën is niet decoratief: ze bepaalt hoe de lijst
 * bij het reserveren van een middel wordt aangeboden. Slepen is daarmee een
 * echte handeling met een echt gevolg, en het meeste werk in dit bestand gaat
 * daarover.
 *
 * Verder wordt getest wat de beheerder ziet en doet: de lijst met kleur, icoon
 * en aantal, een categorie toevoegen met een voorbeeldweergave die meeloopt,
 * hernoemen, verwijderen, en wat er gebeurt als de server nee zegt.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResourceCategoriesManager } from '../ResourceCategoriesManager';
import {
  getResourceCategories,
  createResourceCategory,
  updateResourceCategory,
  deleteResourceCategory,
  reorderResourceCategories,
  type ResourceCategory,
} from '../../api/resources';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api/resources', () => ({
  getResourceCategories: vi.fn(),
  createResourceCategory: vi.fn(),
  updateResourceCategory: vi.fn(),
  deleteResourceCategory: vi.fn(),
  reorderResourceCategories: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) => {
      const invulling = opties && (opties.name ?? opties.color ?? opties.icon);
      return typeof invulling === 'string' ? `${sleutel}:${invulling}` : sleutel;
    },
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const categorieenOphalen = vi.mocked(getResourceCategories);
const aanmaken = vi.mocked(createResourceCategory);
const bijwerken = vi.mocked(updateResourceCategory);
const verwijderen = vi.mocked(deleteResourceCategory);
const herordenen = vi.mocked(reorderResourceCategories);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

function categorie(overschrijving: Partial<ResourceCategory> & { id: string; name: string }): ResourceCategory {
  return { sortOrder: 0, resourceCount: 0, color: '#6366f1', ...overschrijving };
}

/**
 * De volgorde waarin de server ze teruggeeft is bewust níét de volgorde waarin
 * ze horen te staan; `sortOrder` bepaalt dat. Zie het bewijs bij het slepen.
 */
const CATEGORIEEN = [
  categorie({ id: 'cat-c', name: 'Zalen', sortOrder: 3, icon: 'building', resourceCount: 2 }),
  categorie({ id: 'cat-a', name: 'Bussen', sortOrder: 1, description: 'Vervoer naar concerten' }),
  categorie({ id: 'cat-b', name: 'Instrumenten', sortOrder: 2 }),
];

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(sluiten = vi.fn()) {
  render(<ResourceCategoriesManager onClose={sluiten} />, { wrapper: Omhulsel });
  return sluiten;
}

/** De sleepbare regel van een categorie. */
async function regel(naam: string) {
  return await screen.findByRole('button', { name: `common.dragToReorder ${naam}` });
}

/** De regels in de volgorde waarin ze op het scherm staan. */
async function regelsOpVolgorde() {
  const alle = await screen.findAllByRole('button', { name: /^common\.dragToReorder / });
  return alle.map((r) => r.getAttribute('aria-label')!.replace('common.dragToReorder ', ''));
}

/** Opent het toevoegvenster en geeft dat venster terug. */
async function openToevoegen(bediener: ReturnType<typeof userEvent.setup>) {
  await bediener.click(await screen.findByRole('button', { name: 'resources.categories.add' }));
  return await screen.findByRole('dialog', { name: 'resources.categories.add' });
}

beforeEach(() => {
  vi.clearAllMocks();
  categorieenOphalen.mockResolvedValue(CATEGORIEEN);
  aanmaken.mockResolvedValue({ id: 'cat-d', message: 'ok' } as never);
  bijwerken.mockResolvedValue({ message: 'ok' } as never);
  verwijderen.mockResolvedValue({ message: 'ok' } as never);
  herordenen.mockResolvedValue({ message: 'ok' } as never);
});

describe('ResourceCategoriesManager, de lijst', () => {
  it('zet de categorieën in hun eigen volgorde, niet in die van de server', async () => {
    toon();

    expect(await regelsOpVolgorde()).toEqual(['Bussen', 'Instrumenten', 'Zalen']);
  });

  it('toont per categorie de omschrijving en het aantal middelen', async () => {
    toon();

    const bussen = await regel('Bussen');
    expect(within(bussen).getByText('Vervoer naar concerten')).toBeInTheDocument();
    expect(within(await regel('Zalen')).getByText('2 resources.title')).toBeInTheDocument();
  });

  it('meldt het als er nog geen categorieën zijn', async () => {
    categorieenOphalen.mockResolvedValueOnce([]);
    toon();

    expect(await screen.findByText('resources.categories.noCategories')).toBeInTheDocument();
  });

  it('houdt de verwijderknop op slot zolang er middelen in de categorie zitten', async () => {
    toon();

    expect(within(await regel('Zalen')).getByRole('button', { name: 'common.delete' })).toBeDisabled();
    expect(within(await regel('Bussen')).getByRole('button', { name: 'common.delete' })).toBeEnabled();
  });
});

describe('ResourceCategoriesManager, de volgorde slepen', () => {
  /** Sleept een categorie naar de positie waar nu de andere staat. */
  async function sleep(vanNaam: string, naarIndex: number) {
    const bron = await regel(vanNaam);
    const doelen = await screen.findAllByRole('button', { name: /^common\.dragToReorder / });
    fireEvent.dragStart(bron);
    fireEvent.dragOver(doelen[naarIndex]);
    fireEvent.dragEnd(bron);
  }

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. De oude
   * ResourceCategoriesManager.tsx rekende in `handleDragEnd` met `categories` -
   * de lijst zoals de server hem teruggaf - terwijl op het scherm
   * `sortedCategories` staat, gesorteerd op `sortOrder`. Zolang de server
   * toevallig al op volgorde levert vallen die twee samen, maar zodra dat niet
   * zo is, wijst dezelfde index naar een andere categorie.
   *
   * Met deze gegevens (server: Zalen, Bussen, Instrumenten; scherm: Bussen,
   * Instrumenten, Zalen) sleept de beheerder Zalen naar voren. In de
   * schermvolgorde staat Zalen op 2 en moet hij naar 0; in de serverlijst staat
   * hij toevallig al op 0, dus de oude code concludeerde "die staat al goed" en
   * verstuurde niets. Gemeten op de oude code: `reorderResourceCategories` werd
   * nul keer aangeroepen. Slepen deed dan zichtbaar niets, zonder melding.
   */
  it('stuurt de volgorde zoals hij op het scherm staat, niet zoals de server hem gaf', async () => {
    toon();
    await regelsOpVolgorde();

    await sleep('Zalen', 0);

    await waitFor(() => expect(herordenen).toHaveBeenCalledTimes(1));
    expect(herordenen.mock.calls[0][0]).toEqual(['cat-c', 'cat-a', 'cat-b']);
    expect(succes).toHaveBeenCalledWith('resources.categories.reordered');
  });

  it('verplaatst een categorie ook naar achteren', async () => {
    toon();
    await regelsOpVolgorde();

    await sleep('Bussen', 2);

    await waitFor(() => expect(herordenen).toHaveBeenCalledTimes(1));
    expect(herordenen.mock.calls[0][0]).toEqual(['cat-b', 'cat-c', 'cat-a']);
  });

  it('verstuurt niets als de categorie op zijn eigen plek wordt losgelaten', async () => {
    toon();
    await regelsOpVolgorde();

    await sleep('Instrumenten', 1);

    expect(herordenen).not.toHaveBeenCalled();
  });

  it('verstuurt niets als er losgelaten wordt zonder ergens overheen te gaan', async () => {
    toon();
    const bron = await regel('Zalen');

    fireEvent.dragStart(bron);
    fireEvent.dragEnd(bron);

    expect(herordenen).not.toHaveBeenCalled();
  });

  it('meldt het als de server de nieuwe volgorde niet accepteert', async () => {
    herordenen.mockRejectedValueOnce(new Error('server weg'));
    toon();
    await regelsOpVolgorde();

    await sleep('Zalen', 0);

    await waitFor(() => expect(fout).toHaveBeenCalledWith('resources.categories.errorReorder'));
  });
});

describe('ResourceCategoriesManager, toevoegen', () => {
  it('houdt de bewaarknop op slot zolang de naam leeg is of alleen spaties bevat', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);
    const bewaren = within(venster).getByRole('button', { name: 'common.create' });

    expect(bewaren).toBeDisabled();
    await bediener.type(within(venster).getByLabelText(/common\.name/), '   ');
    expect(bewaren).toBeDisabled();

    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Zalen');
    expect(bewaren).toBeEnabled();
  });

  it('laat het voorbeeld meelopen met wat de beheerder kiest', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    expect(within(venster).getByText('resources.categories.untitled')).toBeInTheDocument();
    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Podiumdelen');
    await bediener.click(within(venster).getByRole('radio', { name: 'resources.categories.selectIcon:truck' }));

    const voorbeeld = within(venster).getByText('Podiumdelen').closest<HTMLElement>('[aria-live="polite"]')!;
    expect(within(voorbeeld).getByTestId('icoon-truck')).toBeInTheDocument();
  });

  it('stuurt naam, omschrijving, kleur en icoon naar de server', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Podiumdelen');
    await bediener.type(within(venster).getByLabelText('common.description'), 'Praktikabels en trappen');
    await bediener.click(within(venster).getByRole('radio', { name: 'resources.categories.selectColor:#22c55e' }));
    await bediener.click(within(venster).getByRole('radio', { name: 'resources.categories.selectIcon:package' }));
    await bediener.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(aanmaken).toHaveBeenCalledTimes(1));
    expect(aanmaken.mock.calls[0][0]).toEqual({
      name: 'Podiumdelen',
      description: 'Praktikabels en trappen',
      color: '#22c55e',
      icon: 'package',
    });
    expect(succes).toHaveBeenCalledWith('resources.categories.created');
  });

  it('laat een lege omschrijving en een leeg icoon weg in plaats van ze leeg te versturen', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Podiumdelen');
    await bediener.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(aanmaken).toHaveBeenCalledTimes(1));
    expect(aanmaken.mock.calls[0][0]).toEqual({
      name: 'Podiumdelen',
      description: undefined,
      color: '#6366f1',
      icon: undefined,
    });
  });

  it('laat een gekozen icoon weer los', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Podiumdelen');
    await bediener.click(within(venster).getByRole('radio', { name: 'resources.categories.selectIcon:music' }));
    await bediener.click(within(venster).getByRole('radio', { name: 'common.none' }));
    await bediener.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(aanmaken).toHaveBeenCalledTimes(1));
    expect(aanmaken.mock.calls[0][0]).toMatchObject({ icon: undefined });
  });

  it('meldt het als aanmaken mislukt en houdt het venster open', async () => {
    aanmaken.mockRejectedValueOnce(new Error('server weg'));
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Podiumdelen');
    await bediener.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('resources.categories.errorCreate'));
    expect(screen.getByRole('dialog', { name: 'resources.categories.add' })).toBeInTheDocument();
  });

  it('sluit het venster als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'resources.categories.add' })).not.toBeInTheDocument(),
    );
    expect(aanmaken).not.toHaveBeenCalled();
  });
});

describe('ResourceCategoriesManager, bewerken', () => {
  /** Opent het bewerkvenster van een categorie en geeft dat venster terug. */
  async function openBewerken(bediener: ReturnType<typeof userEvent.setup>, naam: string) {
    await bediener.click(within(await regel(naam)).getByRole('button', { name: 'common.edit' }));
    return await screen.findByRole('dialog', { name: 'resources.categories.edit' });
  }

  it('opent met de bestaande naam ingevuld', async () => {
    const bediener = userEvent.setup();
    toon();

    const venster = await openBewerken(bediener, 'Zalen');

    expect(within(venster).getByLabelText(/common\.name/)).toHaveValue('Zalen');
  });

  /**
   * De omschrijving is bij het bewerken bewust weggelaten: `updateResourceCategory`
   * neemt hem niet aan. Dat staat hier vast zodat het opvalt als de een
   * verandert zonder de ander.
   */
  it('biedt bij het bewerken geen omschrijvingsveld aan', async () => {
    const bediener = userEvent.setup();
    toon();

    const venster = await openBewerken(bediener, 'Bussen');

    expect(within(venster).queryByLabelText('common.description')).not.toBeInTheDocument();
  });

  it('stuurt de gewijzigde naam, kleur en icoon naar de server', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'Zalen');

    await bediener.clear(within(venster).getByLabelText(/common\.name/));
    await bediener.type(within(venster).getByLabelText(/common\.name/), 'Ruimtes');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bijwerken).toHaveBeenCalledTimes(1));
    expect(bijwerken.mock.calls[0][0]).toBe('cat-c');
    expect(bijwerken.mock.calls[0][1]).toEqual({ name: 'Ruimtes', color: '#6366f1', icon: 'building' });
    expect(succes).toHaveBeenCalledWith('resources.categories.updated');
  });

  it('meldt het als bijwerken mislukt', async () => {
    bijwerken.mockRejectedValueOnce(new Error('server weg'));
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'Zalen');

    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('resources.categories.errorUpdate'));
  });
});

describe('ResourceCategoriesManager, verwijderen', () => {
  /** Klikt op verwijderen bij een categorie en geeft de bevestiging terug. */
  async function vraagVerwijderen(bediener: ReturnType<typeof userEvent.setup>, naam: string) {
    await bediener.click(within(await regel(naam)).getByRole('button', { name: 'common.delete' }));
    return await screen.findByRole('alertdialog');
  }

  it('vraagt eerst om bevestiging, met de naam erbij', async () => {
    const bediener = userEvent.setup();
    toon();

    const bevestiging = await vraagVerwijderen(bediener, 'Bussen');

    expect(bevestiging).toHaveTextContent('resources.categories.deleteConfirm:Bussen');
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('verwijdert na bevestiging', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Bussen');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verwijderen).toHaveBeenCalledTimes(1));
    expect(verwijderen.mock.calls[0][0]).toBe('cat-a');
    expect(succes).toHaveBeenCalledWith('resources.categories.deleted');
  });

  it('verwijdert niets als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Bussen');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('meldt het als verwijderen mislukt', async () => {
    verwijderen.mockRejectedValueOnce(new Error('server weg'));
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Bussen');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('resources.categories.errorDelete'));
  });
});
