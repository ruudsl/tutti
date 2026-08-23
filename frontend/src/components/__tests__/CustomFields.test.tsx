/**
 * Aangepaste velden: de soort van een veld komt uit gegevens, niet uit code.
 *
 * Een vereniging verzint zelf welke extra velden er bij een lid, een concert of
 * een instrument horen, en van welke soort die zijn. Het component krijgt die
 * soort als tekst binnen en moet er een invoerveld en een weergave bij kiezen.
 * Elke soort is daarmee een eigen geval, en de soort die niemand kent - een
 * vereniging die 'regenboog' invult, of een nieuwere serverversie die een soort
 * stuurt die deze frontend nog niet kent - hoort niet stilzwijgend van het
 * scherm te verdwijnen. Dat is wat hier vastligt.
 *
 * Er wordt getest wat de gebruiker ziet en doet: een veld invullen en de
 * ingevulde waarde eruit krijgen, een keuzelijst zonder opties, een verplicht
 * veld dat leeg blijft, en het automatisch opslaan tijdens het typen.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomFieldRenderer, CustomFieldFormSection, CustomFieldsSection } from '../CustomFields';
import { getFieldValues, setFieldValues } from '../../api/custom-fields';
import type { FieldValueMeta, FieldValuesResponse } from '../../api/custom-fields';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api/custom-fields', () => ({
  getFieldValues: vi.fn(),
  setFieldValues: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De datumopmaak gaat door de echte code heen; alleen de taalkeuze staat vast,
// anders hangt de verwachte tekst af van de omgeving waarin de test draait.
vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

const waardenOphalen = vi.mocked(getFieldValues);
const waardenOpslaan = vi.mocked(setFieldValues);

/** Een veldbeschrijving met bruikbare standaardwaarden. */
function veld(overschrijving: Partial<FieldValueMeta> & { label: string }): FieldValueMeta {
  return {
    id: `veld-${overschrijving.label}`,
    type: 'text',
    required: false,
    editable: true,
    ...overschrijving,
  };
}

function antwoord(meta: Record<string, FieldValueMeta>, values: Record<string, unknown> = {}): FieldValuesResponse {
  return { meta, values };
}

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(element: ReactNode) {
  return render(<Omhulsel>{element}</Omhulsel>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CustomFieldRenderer - elke soort krijgt zijn eigen weergave', () => {
  it('toont een aankruisvak als ja of nee, ook als het antwoord nee is', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord(
        {
          rijbewijs: veld({ label: 'Rijbewijs', type: 'boolean' }),
          bus: veld({ label: 'Busvervoer', type: 'boolean' }),
        },
        { rijbewijs: true, bus: false },
      ),
    );

    toon(<CustomFieldRenderer entityType="user" entityId="lid-1" showEmpty />);

    expect(await screen.findByText('common.yes')).toBeInTheDocument();
    // `false` is een antwoord en geen leeg veld: 'nee' hoort er te staan.
    expect(screen.getByText('common.no')).toBeInTheDocument();
  });

  it('toont een datum leesbaar en niet als ruwe ISO-tekst', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord({ keuring: veld({ label: 'Keuring', type: 'date' }) }, { keuring: '2026-05-04' }),
    );

    toon(<CustomFieldRenderer entityType="instrument" entityId="i-1" />);

    expect(await screen.findByText('4 mei 2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-05-04')).not.toBeInTheDocument();
  });

  it('toont een tijdstip met de tijd erbij', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord({ aankomst: veld({ label: 'Aankomst', type: 'datetime' }) }, { aankomst: '2026-05-04T14:30:00' }),
    );

    toon(<CustomFieldRenderer entityType="concert" entityId="c-1" />);

    expect(await screen.findByText(/4 mei 2026/)).toBeInTheDocument();
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it('zet een meerkeuzelijst als opsomming neer, en een losse waarde gewoon', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord(
        {
          diploma: veld({ label: 'Diplomas', type: 'multiselect' }),
          een: veld({ label: 'Enkel', type: 'multiselect' }),
        },
        { diploma: ['A', 'B'], een: 'C' },
      ),
    );

    toon(<CustomFieldRenderer entityType="user" entityId="lid-1" />);

    expect(await screen.findByText('A, B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('maakt van een webadres, een e-mailadres en een telefoonnummer een aanklikbare verwijzing', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord(
        {
          site: veld({ label: 'Website', type: 'url' }),
          post: veld({ label: 'E-mail', type: 'email' }),
          tel: veld({ label: 'Telefoon', type: 'phone' }),
        },
        { site: 'https://harmonie.example', post: 'lid@example.org', tel: '0612345678' },
      ),
    );

    toon(<CustomFieldRenderer entityType="contact" entityId="k-1" />);

    expect(await screen.findByRole('link', { name: 'https://harmonie.example' })).toHaveAttribute(
      'href',
      'https://harmonie.example',
    );
    expect(screen.getByRole('link', { name: 'lid@example.org' })).toHaveAttribute('href', 'mailto:lid@example.org');
    expect(screen.getByRole('link', { name: '0612345678' })).toHaveAttribute('href', 'tel:0612345678');
  });

  it('laat een onbekende soort niet verdwijnen maar toont de waarde gewoon', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord(
        // 'regenboog' bestaat niet als soort. Een vereniging kan hem verzinnen,
        // en een nieuwere server kan een soort sturen die deze frontend nog niet
        // kent. In beide gevallen is een lege plek de slechtste uitkomst: de
        // gebruiker weet dan niet dat er iets staat.
        { raar: { id: 'v1', label: 'Lievelingskleur', type: 'regenboog' as never, required: false, editable: true } },
        { raar: 'paars' },
      ),
    );

    toon(<CustomFieldRenderer entityType="user" entityId="lid-1" />);

    expect(await screen.findByText('Lievelingskleur:')).toBeInTheDocument();
    expect(screen.getByText('paars')).toBeInTheDocument();
  });

  it('zet een streepje bij een leeg veld zodra lege velden getoond worden', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord(
        { nota: veld({ label: 'Notitie', type: 'text' }), naam: veld({ label: 'Naam' }) },
        { nota: '', naam: 'Jansen' },
      ),
    );

    toon(<CustomFieldRenderer entityType="user" entityId="lid-1" showEmpty />);

    expect(await screen.findByText('Jansen')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('verbergt lege velden als daar niet om gevraagd is', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord({ nota: veld({ label: 'Notitie' }), naam: veld({ label: 'Naam' }) }, { nota: '', naam: 'Jansen' }),
    );

    toon(<CustomFieldRenderer entityType="user" entityId="lid-1" />);

    expect(await screen.findByText('Naam:')).toBeInTheDocument();
    expect(screen.queryByText('Notitie:')).not.toBeInTheDocument();
  });

  it('tekent niets als er helemaal geen waarden zijn', async () => {
    waardenOphalen.mockResolvedValue(antwoord({ naam: veld({ label: 'Naam' }) }, {}));

    const { container } = toon(<CustomFieldRenderer entityType="user" entityId="lid-1" />);

    await waitFor(() => expect(waardenOphalen).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.custom-fields-display')).toBeNull());
  });
});

describe('CustomFieldFormSection - invullen en opslaan', () => {
  it('geeft de ingetypte tekst door aan de server', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: '' }));
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const veldje = await screen.findByLabelText(/Bijnaam/);
    await gebruiker.type(veldje, 'Kees');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { bijnaam: 'Kees' }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('customFields.saved'));
  });

  it('stuurt een getal als getal en niet als tekst, en een leeggemaakt getal als niets', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ jaren: veld({ label: 'Dienstjaren', type: 'number' }) }, { jaren: 3 }));
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const veldje = await screen.findByLabelText(/Dienstjaren/);
    await gebruiker.clear(veldje);
    await gebruiker.type(veldje, '12');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { jaren: 12 }));

    await gebruiker.clear(veldje);
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));
    await waitFor(() => expect(waardenOpslaan).toHaveBeenLastCalledWith('user', 'lid-1', { jaren: null }));
  });

  it('slaat het aankruisvak op als het aangevinkt wordt', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bus: veld({ label: 'Busvervoer', type: 'boolean' }) }, { bus: false }));
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="concert" entityId="c-1" />);

    await gebruiker.click(await screen.findByRole('checkbox', { name: 'Busvervoer' }));
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('concert', 'c-1', { bus: true }));
  });

  it('kruist opties in een meerkeuzeveld aan en weer uit', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(
      antwoord({ rol: veld({ label: 'Taken', type: 'multiselect', options: ['Bar', 'Kaartjes'] }) }, { rol: ['Bar'] }),
    );
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const kaartjes = await screen.findByRole('checkbox', { name: 'Kaartjes' });
    await gebruiker.click(kaartjes);
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));
    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { rol: ['Bar', 'Kaartjes'] }));

    await gebruiker.click(screen.getByRole('checkbox', { name: 'Bar' }));
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));
    await waitFor(() => expect(waardenOpslaan).toHaveBeenLastCalledWith('user', 'lid-1', { rol: ['Kaartjes'] }));
  });

  it('laat een keuzelijst zonder opties niets te kiezen over, zonder te breken', async () => {
    waardenOphalen.mockResolvedValue(
      // Een vereniging die een keuzeveld aanmaakt en vergeet opties in te vullen.
      antwoord({ maat: veld({ label: 'Uniformmaat', type: 'select' }) }, { maat: '' }),
    );

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const lijst = await screen.findByLabelText(/Uniformmaat/);
    const opties = within(lijst).getAllByRole('option');
    expect(opties).toHaveLength(1);
    expect(opties[0]).toHaveTextContent('common.select');
    expect(opties[0]).toHaveValue('');
  });

  it('kiest een optie uit een keuzelijst en stuurt die mee', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(
      antwoord({ maat: veld({ label: 'Uniformmaat', type: 'select', options: ['S', 'M'] }) }, { maat: '' }),
    );
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    await gebruiker.selectOptions(await screen.findByLabelText(/Uniformmaat/), 'M');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { maat: 'M' }));

    // Terug naar de lege keuze levert niets op, niet de lege tekst.
    await gebruiker.selectOptions(screen.getByLabelText(/Uniformmaat/), '');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));
    await waitFor(() => expect(waardenOpslaan).toHaveBeenLastCalledWith('user', 'lid-1', { maat: null }));
  });

  it('geeft een onbekende soort toch een invoerveld met zijn label', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(
      antwoord(
        { raar: { id: 'v1', label: 'Lievelingskleur', type: 'regenboog' as never, required: false, editable: true } },
        { raar: '' },
      ),
    );
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const veldje = await screen.findByLabelText('Lievelingskleur');
    await gebruiker.type(veldje, 'paars');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { raar: 'paars' }));
  });

  /**
   * WACHT, geen bewijs. Dit legt vast wat er nu gebeurt, niet wat er hoort te
   * gebeuren: een verplicht veld draagt een sterretje en het `required`-kenmerk,
   * maar er staat geen formulier omheen, dus de browser komt er niet aan te pas.
   * Op opslaan drukken met een leeg verplicht veld stuurt de lege waarde
   * gewoon naar de server. Zie het rapport: bewust laten liggen, omdat een
   * melding erbij een nieuwe vertaalsleutel vergt en dat buiten deze drie
   * bestanden valt.
   */
  it('markeert een verplicht veld, maar houdt het opslaan er niet mee tegen', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(
      antwoord({ tel: veld({ label: 'Noodnummer', type: 'phone', required: true }) }, { tel: 'x' }),
    );
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    const veldje = await screen.findByLabelText(/Noodnummer/);
    expect(veldje).toBeRequired();
    expect(screen.getByText('*')).toBeInTheDocument();

    await gebruiker.clear(veldje);
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { tel: '' }));
  });

  it('meldt de fout van de server als het opslaan misgaat', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: '' }));
    waardenOpslaan.mockRejectedValue({ response: { data: { error: 'Waarde bestaat al' } } });

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    await gebruiker.type(await screen.findByLabelText(/Bijnaam/), 'Kees');
    await gebruiker.click(screen.getByRole('button', { name: 'customFields.saveFields' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Waarde bestaat al'));
  });

  it('toont de opslaanknop pas als er iets veranderd is', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: 'Kees' }));

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    await screen.findByLabelText(/Bijnaam/);
    expect(screen.queryByRole('button', { name: 'customFields.saveFields' })).not.toBeInTheDocument();

    await gebruiker.type(screen.getByLabelText(/Bijnaam/), '!');
    expect(screen.getByRole('button', { name: 'customFields.saveFields' })).toBeInTheDocument();
  });

  it('laat velden die niet bewerkt mogen worden alleen zien, zonder invoervelden', async () => {
    waardenOphalen.mockResolvedValue(
      antwoord({ nummer: veld({ label: 'Lidnummer', editable: false }) }, { nummer: '0042' }),
    );

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" />);

    expect(await screen.findByText('0042')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('CustomFieldFormSection - vanzelf opslaan tijdens het typen', () => {
  /**
   * BEWIJS. `handleChange` gaf de opruimfunctie van zijn tijdklok terug
   * (`return () => clearTimeout(timeoutId)`), maar een gewone afhandelaar is
   * geen effect: React doet niets met wat eruit komt. Er werd dus nooit iets
   * afgebroken en elke toetsaanslag zette zijn eigen klok van een seconde.
   * 'Kees' typen leverde vier opslagverzoeken op in plaats van een.
   *
   * Zonder de reparatie is deze test rood: vier aanroepen in plaats van een.
   */
  it('slaat een woord dat in een keer ingetypt wordt maar een keer op', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: '' }));
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" autoSave />);

    await gebruiker.type(await screen.findByLabelText(/Bijnaam/), 'Kees');

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { bijnaam: 'Kees' });
  });

  /**
   * BEWIJS. De klok las `localValues` uit de sluiting van de tekening waarin de
   * toets viel. Twee velden vlak na elkaar invullen betekende dat het tweede
   * verzoek vertrok met de momentopname van voor de eerste wijziging, en die
   * eerste wijziging dus overschreef met de oude waarde.
   *
   * Zonder de reparatie is deze test rood: het laatste verzoek bevat alleen
   * `plaats` en niet `bijnaam`.
   */
  it('stuurt bij twee wijzigingen vlak na elkaar beide waarden mee', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(
      antwoord(
        { bijnaam: veld({ label: 'Bijnaam' }), plaats: veld({ label: 'Woonplaats' }) },
        { bijnaam: '', plaats: '' },
      ),
    );
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" autoSave />);

    await gebruiker.type(await screen.findByLabelText(/Bijnaam/), 'K');
    await gebruiker.type(screen.getByLabelText(/Woonplaats/), 'Venlo');

    await waitFor(() => expect(waardenOpslaan).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(waardenOpslaan).toHaveBeenCalledWith('user', 'lid-1', { bijnaam: 'K', plaats: 'Venlo' });
  });

  /**
   * BEWIJS. Dezelfde ontbrekende opruiming: wie iets intypt en het venster
   * meteen sluit, stuurde een seconde later alsnog een verzoek vanuit een
   * component die er niet meer is.
   *
   * Zonder de reparatie is deze test rood: er vertrekt een verzoek na het
   * verwijderen.
   */
  it('stuurt niets meer nadat het formulier van het scherm is', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: '' }));
    waardenOpslaan.mockResolvedValue({} as never);

    const { unmount } = toon(<CustomFieldFormSection entityType="user" entityId="lid-1" autoSave />);

    await gebruiker.type(await screen.findByLabelText(/Bijnaam/), 'Kees');
    unmount();

    await new Promise((klaar) => setTimeout(klaar, 1500));
    expect(waardenOpslaan).not.toHaveBeenCalled();
  });

  it('toont geen opslaanknop als er vanzelf opgeslagen wordt', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: '' }));
    waardenOpslaan.mockResolvedValue({} as never);

    toon(<CustomFieldFormSection entityType="user" entityId="lid-1" autoSave />);

    await gebruiker.type(await screen.findByLabelText(/Bijnaam/), 'K');
    expect(screen.queryByRole('button', { name: 'customFields.saveFields' })).not.toBeInTheDocument();
  });
});

describe('CustomFieldsSection - kaart met bewerkknop', () => {
  it('wisselt tussen lezen en bewerken en weer terug', async () => {
    const gebruiker = userEvent.setup();
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: 'Kees' }));

    toon(<CustomFieldsSection entityType="user" entityId="lid-1" editable />);

    expect(await screen.findByText('Kees')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));
    expect(await screen.findByLabelText(/Bijnaam/)).toHaveValue('Kees');

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('houdt de bewerkknop weg als er niet bewerkt mag worden', async () => {
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: 'Kees' }));

    toon(<CustomFieldsSection entityType="user" entityId="lid-1" />);

    expect(await screen.findByText('Kees')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
  });

  it('tekent geen kaart als er voor dit soort niets is ingericht', async () => {
    waardenOphalen.mockResolvedValue(antwoord({}, {}));

    const { container } = toon(<CustomFieldsSection entityType="loan" entityId="u-1" />);

    await waitFor(() => expect(waardenOphalen).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.card')).toBeNull());
  });

  it('gebruikt de meegegeven titel boven de kaart', async () => {
    waardenOphalen.mockResolvedValue(antwoord({ bijnaam: veld({ label: 'Bijnaam' }) }, { bijnaam: 'Kees' }));

    toon(<CustomFieldsSection entityType="user" entityId="lid-1" title="Extra gegevens" />);

    expect(await screen.findByRole('heading', { name: 'Extra gegevens' })).toBeInTheDocument();
  });
});
