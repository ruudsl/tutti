/**
 * Het beheer van berichtcategorieën.
 *
 * Een categorie heeft naast een naam ook een slug, en die slug komt in het
 * webadres terecht. Dat maakt dit scherm gevoeliger dan het lijkt: wat er
 * tijdens het typen in dat veld verschijnt, blijft daarna staan.
 *
 * Getest wordt wat de beheerder ziet en doet: de lijst met categorieën en hun
 * aantallen, een categorie toevoegen, hernoemen en verwijderen, de kleur
 * kiezen, en wat er gebeurt als de server nee zegt.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostCategoriesManager } from '../PostCategoriesManager';
import {
  getPostCategories,
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  type PostCategory,
} from '../../api/posts';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api/posts', () => ({
  getPostCategories: vi.fn(),
  createPostCategory: vi.fn(),
  updatePostCategory: vi.fn(),
  deletePostCategory: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) => {
      const invulling = opties && (opties.name ?? opties.color);
      return typeof invulling === 'string' ? `${sleutel}:${invulling}` : sleutel;
    },
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const categorieenOphalen = vi.mocked(getPostCategories);
const aanmaken = vi.mocked(createPostCategory);
const bijwerken = vi.mocked(updatePostCategory);
const verwijderen = vi.mocked(deletePostCategory);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

function categorie(overschrijving: Partial<PostCategory> & { id: string; name: string }): PostCategory {
  return {
    slug: overschrijving.name.toLowerCase(),
    description: '',
    color: '#3b82f6',
    sortOrder: 0,
    postCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overschrijving,
  };
}

const CATEGORIEEN = [
  categorie({ id: 'cat-1', name: 'Mededelingen', slug: 'mededelingen', postCount: 3 }),
  categorie({ id: 'cat-2', name: 'Concerten', slug: 'concerten', postCount: 0, color: '#10b981' }),
];

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(sluiten = vi.fn()) {
  render(<PostCategoriesManager onClose={sluiten} />, { wrapper: Omhulsel });
  return sluiten;
}

/**
 * De invoervelden van het categorieformulier, opgezocht op hun opschrift -
 * zoals een schermlezer ze ook aanwijst. Dat kon eerst niet: de opschriften
 * stonden náást hun veld zonder eraan gekoppeld te zijn.
 */
const naamVeld = (venster: HTMLElement) => within(venster).getByLabelText(/posts\.categories\.name/);
const slugVeld = (venster: HTMLElement) => within(venster).getByLabelText('posts.categories.slug');
const beschrijvingVeld = (venster: HTMLElement) => within(venster).getByLabelText('posts.categories.descriptionLabel');

/** Opent het toevoegvenster en geeft dat venster terug. */
async function openToevoegen(bediener: ReturnType<typeof userEvent.setup>) {
  await bediener.click(await screen.findByRole('button', { name: 'posts.categories.add' }));
  return await screen.findByRole('dialog', { name: 'posts.categories.add' });
}

beforeEach(() => {
  vi.clearAllMocks();
  categorieenOphalen.mockResolvedValue(CATEGORIEEN);
  aanmaken.mockResolvedValue({ id: 'cat-3', message: 'ok' } as never);
  bijwerken.mockResolvedValue({ message: 'ok' } as never);
  verwijderen.mockResolvedValue({ message: 'ok' } as never);
});

describe('PostCategoriesManager, de lijst', () => {
  it('toont elke categorie met haar slug en het aantal berichten', async () => {
    toon();

    const rij = (await screen.findByText('Mededelingen')).closest('tr')!;
    expect(within(rij).getByText('mededelingen')).toBeInTheDocument();
    expect(within(rij).getByText('3')).toBeInTheDocument();
  });

  it('meldt het als er nog geen categorieën zijn', async () => {
    categorieenOphalen.mockResolvedValueOnce([]);
    toon();

    expect(await screen.findByText('posts.categories.noCategories')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('houdt de verwijderknop op slot zolang er berichten in de categorie zitten', async () => {
    toon();

    const bezet = (await screen.findByText('Mededelingen')).closest('tr')!;
    const leeg = screen.getByText('Concerten').closest('tr')!;
    expect(within(bezet).getByRole('button', { name: 'common.delete' })).toBeDisabled();
    expect(within(leeg).getByRole('button', { name: 'common.delete' })).toBeEnabled();
  });
});

describe('PostCategoriesManager, toevoegen', () => {
  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Op de oude
   * PostCategoriesManager.tsx stond in `handleNameChange`:
   *
   *     slug: prev.slug || generateSlug(name)
   *
   * Dat leest als "overschrijf geen slug die de beheerder zelf heeft gezet",
   * maar het meet dat aan de slug zoals die op dat moment is - en na de éérste
   * aanslag staat daar al iets. Wie 'Nieuwsbrief' intikt houdt daarom de slug
   * 'n' over: bij de N is prev.slug nog leeg en wordt er 'n' van gemaakt, en
   * vanaf de i is prev.slug niet meer leeg en verandert er nooit meer iets.
   *
   * Het gemeten resultaat op de oude code was 'n'. Het valt niet op, want het
   * veld staat gevuld, maar de categorie komt daarna op /berichten/n te staan.
   */
  it('maakt de slug van de hele naam, niet van de eerste letter', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Nieuwsbrief');

    expect(slugVeld(venster)).toHaveValue('nieuwsbrief');
  });

  it('maakt van leestekens en spaties koppeltekens', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Nieuws & Zo!');

    expect(slugVeld(venster)).toHaveValue('nieuws-zo');
  });

  it('laat een zelf ingetikte slug met rust als de naam daarna nog verandert', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Concert');
    await bediener.clear(slugVeld(venster));
    await bediener.type(slugVeld(venster), 'najaarsconcert');
    await bediener.type(naamVeld(venster), 'en');

    expect(slugVeld(venster)).toHaveValue('najaarsconcert');
  });

  it('houdt de bewaarknop op slot zolang er geen naam staat', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    expect(within(venster).getByRole('button', { name: 'common.add' })).toBeDisabled();
    await bediener.type(naamVeld(venster), 'Verslagen');
    expect(within(venster).getByRole('button', { name: 'common.add' })).toBeEnabled();
  });

  it('stuurt naam, slug, beschrijving en kleur naar de server', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Verslagen');
    await bediener.type(beschrijvingVeld(venster), 'Na afloop');
    await bediener.click(within(venster).getByRole('radio', { name: 'posts.categories.selectColor:#3b82f6' }));
    await bediener.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(aanmaken).toHaveBeenCalledTimes(1));
    expect(aanmaken.mock.calls[0][0]).toEqual({
      name: 'Verslagen',
      slug: 'verslagen',
      description: 'Na afloop',
      color: '#3b82f6',
    });
    expect(succes).toHaveBeenCalledWith('posts.categories.created');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'posts.categories.add' })).not.toBeInTheDocument());
  });

  it('laat de beheerder een andere kleur kiezen', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Verslagen');
    await bediener.click(within(venster).getByRole('radio', { name: 'posts.categories.selectColor:#8b5cf6' }));
    await bediener.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(aanmaken).toHaveBeenCalledTimes(1));
    expect(aanmaken.mock.calls[0][0]).toMatchObject({ color: '#8b5cf6' });
  });

  it('toont de reden van de server als aanmaken mislukt en houdt het venster open', async () => {
    aanmaken.mockRejectedValueOnce({ response: { data: { error: 'Slug bestaat al' } } });
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);

    await bediener.type(naamVeld(venster), 'Verslagen');
    await bediener.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Slug bestaat al'));
    expect(screen.getByRole('dialog', { name: 'posts.categories.add' })).toBeInTheDocument();
  });

  it('laat het formulier leeg achter als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openToevoegen(bediener);
    await bediener.type(naamVeld(venster), 'Verslagen');

    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'posts.categories.add' })).not.toBeInTheDocument());
    const opnieuw = await openToevoegen(bediener);
    expect(naamVeld(opnieuw)).toHaveValue('');
    expect(slugVeld(opnieuw)).toHaveValue('');
  });
});

describe('PostCategoriesManager, bewerken', () => {
  /** Opent het bewerkvenster van een categorie en geeft dat venster terug. */
  async function openBewerken(bediener: ReturnType<typeof userEvent.setup>, naam: string) {
    const rij = (await screen.findByText(naam)).closest('tr')!;
    await bediener.click(within(rij).getByRole('button', { name: 'common.edit' }));
    return await screen.findByRole('dialog', { name: 'posts.categories.edit' });
  }

  it('opent met de bestaande waarden ingevuld', async () => {
    const bediener = userEvent.setup();
    toon();

    const venster = await openBewerken(bediener, 'Concerten');

    expect(naamVeld(venster)).toHaveValue('Concerten');
    expect(slugVeld(venster)).toHaveValue('concerten');
  });

  /**
   * Een bestaande slug staat in webadressen die al gedeeld zijn. Hernoemen mag
   * die dus niet stilzwijgend meenemen.
   */
  it('laat de bestaande slug staan als de naam verandert', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'Concerten');

    await bediener.clear(naamVeld(venster));
    await bediener.type(naamVeld(venster), 'Optredens');

    expect(slugVeld(venster)).toHaveValue('concerten');
  });

  it('stuurt de wijziging naar de server', async () => {
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'Concerten');

    await bediener.clear(naamVeld(venster));
    await bediener.type(naamVeld(venster), 'Optredens');
    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bijwerken).toHaveBeenCalledTimes(1));
    expect(bijwerken.mock.calls[0][0]).toBe('cat-2');
    expect(bijwerken.mock.calls[0][1]).toMatchObject({ name: 'Optredens', slug: 'concerten' });
    expect(succes).toHaveBeenCalledWith('posts.categories.updated');
  });

  it('toont de reden van de server als bijwerken mislukt', async () => {
    bijwerken.mockRejectedValueOnce({ response: { data: { error: 'Naam al in gebruik' } } });
    const bediener = userEvent.setup();
    toon();
    const venster = await openBewerken(bediener, 'Concerten');

    await bediener.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Naam al in gebruik'));
  });
});

describe('PostCategoriesManager, verwijderen', () => {
  /** Klikt op verwijderen bij een categorie en geeft de bevestiging terug. */
  async function vraagVerwijderen(bediener: ReturnType<typeof userEvent.setup>, naam: string) {
    const rij = (await screen.findByText(naam)).closest('tr')!;
    await bediener.click(within(rij).getByRole('button', { name: 'common.delete' }));
    return await screen.findByRole('alertdialog');
  }

  it('vraagt eerst om bevestiging, met de naam erbij', async () => {
    const bediener = userEvent.setup();
    toon();

    const bevestiging = await vraagVerwijderen(bediener, 'Concerten');

    expect(bevestiging).toHaveTextContent('posts.categories.deleteConfirm:Concerten');
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('verwijdert na bevestiging', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Concerten');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verwijderen).toHaveBeenCalledTimes(1));
    expect(verwijderen.mock.calls[0][0]).toBe('cat-2');
    expect(succes).toHaveBeenCalledWith('posts.categories.deleted');
  });

  it('verwijdert niets als de beheerder afziet', async () => {
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Concerten');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(verwijderen).not.toHaveBeenCalled();
  });

  it('toont de reden van de server als verwijderen mislukt', async () => {
    verwijderen.mockRejectedValueOnce({ response: { data: { error: 'Categorie is nog in gebruik' } } });
    const bediener = userEvent.setup();
    toon();
    const bevestiging = await vraagVerwijderen(bediener, 'Concerten');

    await bediener.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Categorie is nog in gebruik'));
  });
});
