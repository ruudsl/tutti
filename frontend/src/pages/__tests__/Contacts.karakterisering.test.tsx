/**
 * Vangnet voor het opknippen van de contactenpagina.
 *
 * Contacts.tsx is 1344 regels: de pagina zelf plus drie modals - het
 * contactformulier, het detailscherm en het categoriebeheer - in één bestand.
 * Die drie gaan eruit. Bij het verplaatsen van code is de vraag niet of het er
 * daarna netter uitziet, maar of het scherm nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet: wat er bij het openen in beeld komt, welke aanroepen er gebeuren (en
 * welke juist niet), en wat er verandert als je op iets klikt. Zo'n test heet
 * een karakteriseringstest; hij beschrijft het bestaande gedrag, ook waar dat
 * gedrag misschien niet ideaal is.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen bij een
 * verhuizing:
 *   - De `enabled` op de detailquery. Zonder gekozen contact hoort er geen
 *     detail opgehaald te worden. Raakt die voorwaarde zoek, dan vraagt de
 *     pagina bij het openen een contact op dat niemand geopend heeft, en dat
 *     zie je niet aan het scherm.
 *   - Wie welke knoppen ziet. Toevoegen, bewerken en verwijderen hangen aan de
 *     rol; een verhuizing die `canEdit` of `isAdmin` verkeerd meeneemt geeft
 *     een gewoon lid stilzwijgend een verwijderknop.
 *   - De ontdubbeling op het zoekveld. Die zorgt dat er niet per toetsaanslag
 *     een verzoek uitgaat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Contacts from '../Contacts';
import * as contactenApi from '../../api/contacts';
import type { Contact, ContactCategory } from '../../api/contacts';

vi.mock('../../api/contacts');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De rol bepaalt welke knoppen er staan; per test overschrijven we hem.
const huidigeGebruiker: { rol: string } = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: huidigeGebruiker.rol } }),
}));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="maatwerkvelden-formulier" />,
  CustomFieldRenderer: () => <div data-testid="maatwerkvelden-weergave" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const CATEGORIEEN: ContactCategory[] = [
  { id: 'cat-1', name: 'Leveranciers', color: '#ff0000', sortOrder: 1, createdAt: '2026-01-01' },
  { id: 'cat-2', name: 'Zalen', sortOrder: 2, createdAt: '2026-01-01' },
];

function maakContact(overschrijving: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    contactType: 'organization',
    name: 'Concertgebouw',
    email: 'info@concertgebouw.example',
    phone: '0201234567',
    city: 'Amsterdam',
    isActive: true,
    categories: [{ id: 'cat-2', name: 'Zalen' }],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overschrijving,
  };
}

const CONTACTEN: Contact[] = [
  maakContact(),
  maakContact({
    id: 'contact-2',
    contactType: 'person',
    name: 'Jan Jansen',
    email: 'jan@example.com',
    city: 'Utrecht',
    categories: [],
  }),
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(contactenApi)) {
    const functie = (contactenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(contactenApi.getContacts).mockResolvedValue(CONTACTEN);
  vi.mocked(contactenApi.getContactCategories).mockResolvedValue(CATEGORIEEN);
  vi.mocked(contactenApi.getContact).mockResolvedValue(maakContact({ contactPersons: [] }));
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  zetApiKlaar();
});

describe('contactenpagina - vastgelegd gedrag vóór het opknippen', () => {
  it('toont de titel met het aantal contacten', async () => {
    render(<Contacts />, { wrapper: wikkel });

    // Tijdens het laden staat er al een `h1` met alleen de titel erin; het
    // aantal komt er pas bij als de contacten binnen zijn. Daarom eerst
    // wachten tot de tabel er staat, anders keurt de test de laadtoestand.
    await screen.findByRole('button', { name: 'Concertgebouw' });

    const kop = screen.getByRole('heading', { level: 1 });
    expect(kop).toHaveTextContent('contacts.title');
    expect(kop).toHaveTextContent('2');
  });

  it('haalt bij het openen de contacten en de categorieën op', async () => {
    render(<Contacts />, { wrapper: wikkel });

    await waitFor(() => {
      expect(contactenApi.getContacts).toHaveBeenCalled();
      expect(contactenApi.getContactCategories).toHaveBeenCalled();
    });

    // Zonder ingevulde filters gaan alle vier de filtervelden als `undefined`
    // mee. Dat is geen detail: een verhuizing die er lege strings van maakt
    // stuurt filters mee die de server als echte filters leest.
    expect(contactenApi.getContacts).toHaveBeenCalledWith({
      type: undefined,
      category: undefined,
      active: undefined,
      search: undefined,
    });
  });

  it('toont de contacten in de tabel', async () => {
    render(<Contacts />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: 'Concertgebouw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jan Jansen' })).toBeInTheDocument();
    expect(screen.getByText('info@concertgebouw.example')).toBeInTheDocument();
  });

  it('toont de skeletweergave zolang de contacten nog laden', async () => {
    let losmaken: (contacten: Contact[]) => void = () => {};
    vi.mocked(contactenApi.getContacts).mockReturnValue(
      new Promise<Contact[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Contacts />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(CONTACTEN);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('haalt geen contactdetail op zolang er geen contact gekozen is', async () => {
    render(<Contacts />, { wrapper: wikkel });

    await waitFor(() => expect(contactenApi.getContacts).toHaveBeenCalled());

    expect(contactenApi.getContact).not.toHaveBeenCalled();
  });

  it('haalt het detail op en opent het detailscherm na klik op een naam', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Concertgebouw' }));

    await waitFor(() => expect(contactenApi.getContact).toHaveBeenCalledWith('contact-1'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Concertgebouw');
  });

  it('toont een beheerder de knoppen voor toevoegen en categoriebeheer', async () => {
    render(<Contacts />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: /contacts.addContact/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contacts.manageCategories/ })).toBeInTheDocument();
  });

  it('opent het contactformulier via de toevoegknop', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /contacts.addContact/ }));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('contacts.financialDetails');
    expect(screen.getByRole('button', { name: 'common.save' })).toBeInTheDocument();
  });

  it('opent het categoriebeheer met de bestaande categorieën', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    // De tekst `contacts.manageCategories` staat straks twee keer op het
    // scherm: op de knop én als titel van het venster dat eruit komt. De knop
    // wordt daarom vóór de klik opgezocht en daarna niet meer gebruikt.
    await gebruiker.click(await screen.findByRole('button', { name: /contacts.manageCategories/ }));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('Leveranciers');
    expect(venster).toHaveTextContent('Zalen');
  });

  it('toont een gewoon lid geen knoppen om te bewerken', async () => {
    huidigeGebruiker.rol = 'member';
    render(<Contacts />, { wrapper: wikkel });

    await screen.findByRole('button', { name: 'Concertgebouw' });

    expect(screen.queryByRole('button', { name: /contacts.addContact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contacts.manageCategories/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'common.actions' })).not.toBeInTheDocument();
  });

  it('geeft alleen een beheerder de verwijderknop per rij', async () => {
    huidigeGebruiker.rol = 'music_committee';
    render(<Contacts />, { wrapper: wikkel });

    await screen.findByRole('button', { name: 'Concertgebouw' });

    // De muziekcommissie mag wel bewerken, dus de actiekolom staat er,
    // maar de prullenbak hoort alleen bij een beheerder.
    expect(screen.getByRole('columnheader', { name: 'common.actions' })).toBeInTheDocument();
    expect(screen.queryByTestId('icon-trash')).not.toBeInTheDocument();
  });

  it('stuurt de zoekterm pas mee na de ontdubbeling', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    const zoekveld = await screen.findByPlaceholderText('contacts.searchPlaceholder');
    await gebruiker.type(zoekveld, 'gebouw');

    // Per toetsaanslag een verzoek zou zes extra aanroepen geven; er hoort er
    // één te komen, met het hele woord.
    await waitFor(
      () =>
        expect(contactenApi.getContacts).toHaveBeenCalledWith({
          type: undefined,
          category: undefined,
          active: undefined,
          search: 'gebouw',
        }),
      { timeout: 2000 },
    );
    expect(vi.mocked(contactenApi.getContacts).mock.calls).toHaveLength(2);
  });

  it('houdt de pagina gevuld als het ophalen mislukt', async () => {
    vi.mocked(contactenApi.getContacts).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(contactenApi.getContactCategories).mockRejectedValue(new Error('geen verbinding'));

    render(<Contacts />, { wrapper: wikkel });

    await waitFor(() => expect(contactenApi.getContacts).toHaveBeenCalled());

    // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
    // een kapotte pagina te onderscheiden. Dat de kop, de filters en de lege
    // tabel blijven staan is dus gedrag dat het opknippen moet overleven.
    expect(await screen.findByText('contacts.noContacts')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('contacts.title');
    expect(screen.getByPlaceholderText('contacts.searchPlaceholder')).toBeInTheDocument();
  });
});

/**
 * Hieronder staan geen karakteriseringstests maar regressietests: ze leggen
 * gedrag vast zoals het hoort te zijn, na het herstellen van een fout in de
 * terugweg van het bewerkformulier. Zonder die reparatie is de eerste rood.
 */
describe('contactenpagina - herstelde fouten', () => {
  it('keert na het opslaan van een bewerking terug in het detailvenster', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Concertgebouw' }));

    const detail = await screen.findByRole('dialog');
    await gebruiker.click(within(detail).getByRole('button', { name: 'common.edit' }));

    const formulier = await screen.findByRole('dialog');
    expect(formulier).toHaveTextContent('contacts.editContact');

    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(contactenApi.updateContact).toHaveBeenCalled());

    // Het venster blijft open en toont weer het contact zelf; wie net iets
    // bewerkt heeft wil vaak nog iets anders nakijken.
    const terug = await screen.findByRole('dialog');
    await waitFor(() => expect(terug).not.toHaveTextContent('contacts.editContact'));
    expect(terug).toHaveTextContent('Concertgebouw');
    expect(terug).toHaveTextContent('contacts.contactPersons');
  });

  it('sluit het formulier voor een nieuw contact wel helemaal', async () => {
    const gebruiker = userEvent.setup();
    render(<Contacts />, { wrapper: wikkel });

    // De tweede ingang van hetzelfde formulier: vanuit de lijst, zonder
    // detailvenster erachter. Daar hoort sluiten wél terug naar de lijst te
    // leiden - de reparatie hierboven mag dat niet omgooien.
    await gebruiker.click(await screen.findByRole('button', { name: /contacts.addContact/ }));

    const formulier = await screen.findByRole('dialog');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
