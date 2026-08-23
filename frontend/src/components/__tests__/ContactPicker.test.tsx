/**
 * De contactkiezer: een contact uitzoeken uit de lijst van de eigen vereniging.
 *
 * Twee dingen staan hier centraal.
 *
 * Het eerste is de verenigingsgrens. De kiezer toont wat de server voor de
 * huidige vereniging teruggeeft, en niets anders; hij mag geen naam op het
 * scherm zetten die niet in die lijst staat, ook niet als de aanroeper een id
 * meegeeft dat van elders komt. Aan de serverkant zijn daar meerdere lekken
 * gevonden, dus de frontendkant wordt hier vastgezet: alles wat zichtbaar of
 * kiesbaar is, komt uit het antwoord van deze vereniging, en het typefilter
 * blijft ook tijdens het zoeken staan.
 *
 * Het tweede is dat de kiezer bedienbaar is. Het aanklikvlak was een `div`
 * zonder rol en zonder tabvolgorde; met alleen een toetsenbord kwam je er niet
 * in. Zie de tests met BEWIJS erboven.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactPicker, MultiContactPicker } from '../ContactPicker';
import { getContacts } from '../../api/contacts';
import type { Contact } from '../../api/contacts';

vi.mock('../../api/contacts', () => ({
  getContacts: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const contactenOphalen = vi.mocked(getContacts);

function contact(overschrijving: Partial<Contact> & { id: string; name: string }): Contact {
  return {
    contactType: 'person',
    isActive: true,
    categories: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overschrijving,
  };
}

/** De lijst zoals de server hem voor de eigen vereniging teruggeeft. */
const EIGEN_VERENIGING: Contact[] = [
  contact({
    id: 'k-1',
    name: 'Zaal De Harmonie',
    contactType: 'venue',
    city: 'Venlo',
    email: 'zaal@example.org',
    categories: [{ id: 'cat-1', name: 'Zalen', color: '#123456' }],
  }),
  contact({ id: 'k-2', name: 'Jan Bakker', contactType: 'person', city: 'Roermond', email: 'jan@example.org' }),
  contact({ id: 'k-3', name: 'Muziekhandel Noten', contactType: 'vendor', city: 'Venlo' }),
];

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(element: ReactNode) {
  return render(<Omhulsel>{element}</Omhulsel>);
}

/** Het uitklapvlak, herkenbaar aan het zoekveld dat erin staat. */
function uitklapvlak() {
  return screen.getByPlaceholderText('common.search').closest('div')!.parentElement!;
}

beforeEach(() => {
  vi.clearAllMocks();
  contactenOphalen.mockResolvedValue(EIGEN_VERENIGING);
});

describe('ContactPicker - kiezen uit de lijst', () => {
  it('toont de contacten van deze vereniging pas nadat de lijst opengeklapt is', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    expect(screen.getByText('contacts.selectContact')).toBeInTheDocument();
    expect(screen.queryByText('Jan Bakker')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByText('contacts.selectContact'));

    expect(await screen.findByText('Jan Bakker')).toBeInTheDocument();
    expect(screen.getByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.getByText('Muziekhandel Noten')).toBeInTheDocument();
  });

  it('geeft het gekozen contact door en klapt de lijst dicht', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    toon(<ContactPicker value={null} onChange={gekozen} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    await gebruiker.click(await screen.findByText('Jan Bakker'));

    expect(gekozen).toHaveBeenCalledWith('k-2', expect.objectContaining({ id: 'k-2', name: 'Jan Bakker' }));
    await waitFor(() => expect(screen.queryByPlaceholderText('common.search')).not.toBeInTheDocument());
  });

  it('toont de naam en de plaats van het gekozen contact in het veld', async () => {
    toon(<ContactPicker value="k-1" onChange={vi.fn()} />);

    expect(await screen.findByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.getByText('Venlo')).toBeInTheDocument();
    expect(screen.queryByText('contacts.selectContact')).not.toBeInTheDocument();
  });

  it('maakt de keuze leeg zonder de lijst open te klappen', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    toon(<ContactPicker value="k-1" onChange={gekozen} />);

    await screen.findByText('Zaal De Harmonie');
    await gebruiker.click(screen.getByTestId('icon-close').closest('button')!);

    expect(gekozen).toHaveBeenCalledWith(null, null);
    // Het kruisje mag de lijst niet openzetten; dat is een aparte handeling.
    expect(screen.queryByPlaceholderText('common.search')).not.toBeInTheDocument();
  });

  it('houdt het kruisje weg als leegmaken niet mag', async () => {
    toon(<ContactPicker value="k-1" onChange={vi.fn()} allowClear={false} />);

    await screen.findByText('Zaal De Harmonie');
    expect(screen.queryByTestId('icon-close')).not.toBeInTheDocument();
  });

  it('doet niets als de kiezer op slot staat', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value="k-1" onChange={vi.fn()} disabled />);

    await screen.findByText('Zaal De Harmonie');
    expect(screen.queryByTestId('icon-close')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByText('Zaal De Harmonie'));
    expect(screen.queryByPlaceholderText('common.search')).not.toBeInTheDocument();
  });

  it('zoekt op naam, op e-mailadres en op plaats', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    const zoekveld = await screen.findByPlaceholderText('common.search');

    await gebruiker.type(zoekveld, 'bakker');
    expect(screen.getByText('Jan Bakker')).toBeInTheDocument();
    expect(screen.queryByText('Zaal De Harmonie')).not.toBeInTheDocument();

    await gebruiker.clear(zoekveld);
    await gebruiker.type(zoekveld, 'zaal@example.org');
    expect(screen.getByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.queryByText('Jan Bakker')).not.toBeInTheDocument();

    await gebruiker.clear(zoekveld);
    await gebruiker.type(zoekveld, 'venlo');
    expect(screen.getByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.getByText('Muziekhandel Noten')).toBeInTheDocument();
    expect(screen.queryByText('Jan Bakker')).not.toBeInTheDocument();
  });

  it('meldt het als er niets op de zoekterm past', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    await gebruiker.type(await screen.findByPlaceholderText('common.search'), 'zzzz');

    expect(screen.getByText('contacts.noResults')).toBeInTheDocument();
    expect(screen.queryByText('contacts.noContacts')).not.toBeInTheDocument();
  });

  it('meldt een lege lijst anders dan een mislukte zoekopdracht', async () => {
    const gebruiker = userEvent.setup();
    contactenOphalen.mockResolvedValue([]);
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));

    expect(await screen.findByText('contacts.noContacts')).toBeInTheDocument();
  });

  it('laat zien dat de lijst nog onderweg is', async () => {
    const gebruiker = userEvent.setup();
    contactenOphalen.mockImplementation(() => new Promise(() => {}));
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('zet het label met een sterretje boven het veld', async () => {
    toon(<ContactPicker value={null} onChange={vi.fn()} label="Zaal" required />);

    expect(screen.getByText('Zaal')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('klapt dicht bij een klik ergens anders op de bladzijde', async () => {
    const gebruiker = userEvent.setup();
    toon(
      <>
        <ContactPicker value={null} onChange={vi.fn()} />
        <button type="button">ergens anders</button>
      </>,
    );

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    expect(await screen.findByPlaceholderText('common.search')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'ergens anders' }));
    await waitFor(() => expect(screen.queryByPlaceholderText('common.search')).not.toBeInTheDocument());
  });
});

describe('ContactPicker - de verenigingsgrens', () => {
  /**
   * WACHT, geen bewijs: dit gedrag was er al en wordt hier vastgezet.
   *
   * De kiezer tekent alleen namen die in het antwoord van de server voor deze
   * vereniging staan. Krijgt hij een id mee dat daar niet in voorkomt - een
   * contact van een andere vereniging, of een contact dat sinds die keuze weg
   * is - dan komt er geen naam op het scherm, ook geen ruwe id.
   */
  it('tekent geen naam bij een id dat niet in de lijst van deze vereniging staat', async () => {
    toon(<ContactPicker value="k-van-andere-vereniging" onChange={vi.fn()} />);

    await waitFor(() => expect(contactenOphalen).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('contacts.selectContact')).toBeInTheDocument());
    expect(screen.queryByText(/k-van-andere-vereniging/)).not.toBeInTheDocument();
  });

  /**
   * WACHT. Het typefilter is een grens die de gebruiker ziet: vraagt een
   * formulier om een zaal, dan mag er geen persoon in de lijst opduiken. Het
   * filter moet ook tijdens het zoeken blijven staan - anders is zoeken een
   * omweg om er langs te komen.
   */
  it('toont alleen de gevraagde soorten, ook als er gezocht wordt', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} contactTypes={['venue']} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));

    expect(await screen.findByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.queryByText('Jan Bakker')).not.toBeInTheDocument();
    expect(screen.queryByText('Muziekhandel Noten')).not.toBeInTheDocument();

    // 'venlo' past op de zaal en op de muziekhandel; alleen de zaal mag blijven.
    await gebruiker.type(await screen.findByPlaceholderText('common.search'), 'venlo');
    expect(screen.getByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.queryByText('Muziekhandel Noten')).not.toBeInTheDocument();
  });

  it('vraagt de server alleen om contacten die in gebruik zijn', async () => {
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await waitFor(() => expect(contactenOphalen).toHaveBeenCalledWith({ active: true }));
  });

  it('zet de soort en de plaats onder de naam, en hoogstens twee groepen ernaast', async () => {
    const gebruiker = userEvent.setup();
    contactenOphalen.mockResolvedValue([
      contact({
        id: 'k-1',
        name: 'Zaal De Harmonie',
        contactType: 'venue',
        city: 'Venlo',
        categories: [
          { id: 'cat-1', name: 'Zalen' },
          { id: 'cat-2', name: 'Sponsors' },
          { id: 'cat-3', name: 'Vrienden' },
        ],
      }),
    ]);
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    const regel = (await screen.findByText('Zaal De Harmonie')).parentElement!.parentElement!;

    expect(within(regel).getByText('contacts.type.venue · Venlo')).toBeInTheDocument();
    // Meer dan twee groepen zouden de regel overwoekeren; er passen er twee.
    expect(within(regel).getByText('Zalen')).toBeInTheDocument();
    expect(within(regel).getByText('Sponsors')).toBeInTheDocument();
    expect(within(regel).queryByText('Vrienden')).not.toBeInTheDocument();
  });
});

describe('ContactPicker - bedienen met het toetsenbord', () => {
  /**
   * BEWIJS. Het aanklikvlak was een `div` met alleen een `onClick`: geen rol,
   * geen plek in de tabvolgorde. Wie de muis niet gebruikt kwam de lijst dus
   * niet in - het veld was voor hem onbestaand. Het draagt nu de rol combobox,
   * staat in de tabvolgorde en luistert naar Enter en spatie.
   *
   * Zonder de reparatie is deze test rood: er is geen element met de rol
   * combobox, dus de test faalt al bij het opzoeken ervan.
   */
  it('klapt open met Enter nadat het veld de aandacht krijgt', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();

    await gebruiker.keyboard('{Enter}');
    expect(await screen.findByPlaceholderText('common.search')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * BEWIJS. Idem: met de spatiebalk, en zonder dat de bladzijde meescrolt.
   * Zonder de reparatie is deze test rood.
   */
  it('klapt open met de spatiebalk en weer dicht met Escape', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.tab();
    await gebruiker.keyboard(' ');
    expect(await screen.findByPlaceholderText('common.search')).toBeInTheDocument();

    await gebruiker.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByPlaceholderText('common.search')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * BEWIJS. Een veld op slot hoort ook voor het toetsenbord op slot te zitten:
   * het mag niet in de tabvolgorde staan. Zonder de reparatie is deze test
   * rood, want er is geen combobox om na te kijken.
   */
  it('laat een kiezer op slot buiten de tabvolgorde', async () => {
    toon(<ContactPicker value="k-1" onChange={vi.fn()} disabled />);

    await screen.findByText('Zaal De Harmonie');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('tabindex', '-1');
  });

  it('laat een spatie in het zoekveld gewoon een spatie zijn', async () => {
    const gebruiker = userEvent.setup();
    toon(<ContactPicker value={null} onChange={vi.fn()} />);

    await gebruiker.click(screen.getByText('contacts.selectContact'));
    const zoekveld = await screen.findByPlaceholderText('common.search');
    await gebruiker.type(zoekveld, 'jan b');

    expect(zoekveld).toHaveValue('jan b');
    expect(screen.getByText('Jan Bakker')).toBeInTheDocument();
  });
});

describe('MultiContactPicker - meer dan een contact', () => {
  it('voegt contacten toe en houdt de al gekozen contacten uit de lijst', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    toon(<MultiContactPicker value={['k-1']} onChange={gekozen} />);

    // Het gekozen contact staat als plaatje boven het veld.
    expect(await screen.findByText('Zaal De Harmonie')).toBeInTheDocument();

    await gebruiker.click(screen.getByText('contacts.addContact'));
    await screen.findByPlaceholderText('common.search');

    const lijst = uitklapvlak();
    expect(within(lijst).queryByText('Zaal De Harmonie')).not.toBeInTheDocument();
    await gebruiker.click(within(lijst).getByText('Jan Bakker'));

    expect(gekozen).toHaveBeenCalledWith(['k-1', 'k-2']);
  });

  it('haalt een gekozen contact er weer af', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    toon(<MultiContactPicker value={['k-1', 'k-2']} onChange={gekozen} />);

    await screen.findByText('Zaal De Harmonie');
    const plaatje = screen.getByText('Jan Bakker').closest('div')!;
    await gebruiker.click(within(plaatje).getByTestId('icon-close').closest('button')!);

    expect(gekozen).toHaveBeenCalledWith(['k-1']);
  });

  it('stopt bij het afgesproken maximum en telt mee hoeveel er nog kunnen', async () => {
    toon(<MultiContactPicker value={['k-1', 'k-2']} onChange={vi.fn()} max={2} label="Zalen" />);

    expect(await screen.findByText('Zaal De Harmonie')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    // Het toevoegvlak hoort weg te zijn zodra het maximum bereikt is.
    expect(screen.queryByText('contacts.addContact')).not.toBeInTheDocument();
  });

  it('meldt het als alles al gekozen is', async () => {
    const gebruiker = userEvent.setup();
    toon(<MultiContactPicker value={['k-1', 'k-2', 'k-3']} onChange={vi.fn()} />);

    await gebruiker.click(await screen.findByText('contacts.addContact'));

    expect(await screen.findByText('contacts.allSelected')).toBeInTheDocument();
  });

  it('houdt zich ook hier aan de gevraagde soorten', async () => {
    const gebruiker = userEvent.setup();
    toon(<MultiContactPicker value={[]} onChange={vi.fn()} contactTypes={['person', 'vendor']} />);

    await gebruiker.click(await screen.findByText('contacts.addContact'));
    const lijst = uitklapvlak();

    expect(within(lijst).getByText('Jan Bakker')).toBeInTheDocument();
    expect(within(lijst).getByText('Muziekhandel Noten')).toBeInTheDocument();
    expect(within(lijst).queryByText('Zaal De Harmonie')).not.toBeInTheDocument();
  });

  it('laat geen verwijderknoppen zien als de kiezer op slot staat', async () => {
    toon(<MultiContactPicker value={['k-1']} onChange={vi.fn()} disabled />);

    await screen.findByText('Zaal De Harmonie');
    expect(screen.queryByTestId('icon-close')).not.toBeInTheDocument();
  });

  /**
   * BEWIJS. Ook hier was het toevoegvlak een `div` zonder rol en zonder plek in
   * de tabvolgorde. Zonder de reparatie is deze test rood: er is geen knop met
   * die naam om de aandacht aan te geven.
   */
  it('opent het toevoegvlak met het toetsenbord', async () => {
    const gebruiker = userEvent.setup();
    toon(<MultiContactPicker value={[]} onChange={vi.fn()} />);

    await gebruiker.tab();
    expect(screen.getByRole('button', { name: /contacts.addContact/ })).toHaveFocus();

    await gebruiker.keyboard('{Enter}');
    expect(await screen.findByPlaceholderText('common.search')).toBeInTheDocument();
  });
});
