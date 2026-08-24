/**
 * Maatwerkvelden beheren: wie mag wat zien, en wat kan er nog gewijzigd worden.
 *
 * Deze pagina is alleen voor een beheerder bereikbaar, maar hij bepaalt wel wat
 * gewone leden straks te zien krijgen: elk veld krijgt een zichtbaarheid mee -
 * iedereen, alleen beheerders, commissie en hoger, of alleen de betrokkene
 * zelf. Die vier keuzes zijn het rechtenhart van deze pagina en staan hieronder
 * met naam genoemd, zodat het opvalt als er een verdwijnt of bij komt.
 *
 * Twee dingen zijn na aanmaken niet meer te wijzigen: de sleutel van het veld
 * en het veldtype. De gegevens die er al onder hangen zijn ermee opgeslagen;
 * ze alsnog omzetten zou die gegevens onbereikbaar maken. Het formulier zet
 * beide velden daarom op slot zodra er een bestaand veld in staat, en die twee
 * sloten worden hier nagekeken.
 *
 * Het aankruisvakje "zelf te bewerken" hoort alleen bij velden van een lid: bij
 * een orkest of een concert is er geen "zelf". Dat de pagina dat vakje weglaat
 * bij een ander soort is een rechtenbeslissing, geen opmaak.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CustomFieldsAdmin from '../CustomFieldsAdmin';

const { velden, haal, maak, wijzig, verwijder } = vi.hoisted(() => ({
  velden: {
    user: [
      {
        id: 'veld-1',
        entityType: 'user',
        fieldKey: 'rijbewijs',
        fieldLabel: 'Rijbewijs',
        fieldType: 'boolean',
        fieldOptions: null,
        isRequired: true,
        isUnique: false,
        visibility: 'admin_only',
        selfEditable: false,
        sortOrder: 0,
      },
      {
        id: 'veld-2',
        entityType: 'user',
        fieldKey: 'shirtmaat',
        fieldLabel: 'Shirtmaat',
        fieldType: 'select',
        fieldOptions: ['S', 'M', 'L'],
        isRequired: false,
        isUnique: false,
        visibility: 'self_only',
        selfEditable: true,
        sortOrder: 1,
      },
    ],
    orchestra: [] as Record<string, unknown>[],
  },
  haal: vi.fn(),
  maak: vi.fn(),
  wijzig: vi.fn(),
  verwijder: vi.fn(),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && 'name' in opties ? `${sleutel}:${opties.name}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../api/custom-fields', () => ({
  getFieldDefinitions: (soort: string) => haal(soort),
  createFieldDefinition: (gegevens: unknown) => maak(gegevens),
  updateFieldDefinition: (id: string, gegevens: unknown) => wijzig(id, gegevens),
  deleteFieldDefinition: (id: string) => verwijder(id),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="skelet-tabel" /> }));

const { meldingen } = vi.hoisted(() => ({ meldingen: { goed: vi.fn(), fout: vi.fn() } }));
vi.mock('../../utils/toast', () => ({
  showSuccess: (m: string) => meldingen.goed(m),
  showError: (m: string) => meldingen.fout(m),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<CustomFieldsAdmin />, { wrapper: wikkel });
  // Wachten op de tabel en niet op de kop: tijdens het laden staat dezelfde kop
  // al boven het skelet.
  await screen.findByRole('table');
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  haal.mockImplementation(async (soort: string) => (velden as Record<string, unknown[]>)[soort] ?? []);
  maak.mockResolvedValue({});
  wijzig.mockResolvedValue({});
  verwijder.mockResolvedValue({});
});

describe('maatwerkvelden - de lijst', () => {
  it('toont per veld de sleutel, het type, de zichtbaarheid en of het verplicht is', async () => {
    await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    expect(within(rij).getByText('rijbewijs')).toBeInTheDocument();
    expect(within(rij).getByText('customFields.fieldTypes.boolean')).toBeInTheDocument();
    // De zichtbaarheid staat er met naam bij: dit veld is alleen voor beheerders.
    expect(within(rij).getByText('customFields.visibility.admin_only')).toBeInTheDocument();
    expect(within(rij).getByTestId('icoon-check')).toBeInTheDocument();
  });

  it('toont een niet-verplicht veld met een streepje in plaats van een vinkje', async () => {
    await toonPagina();

    const rij = screen.getByText('Shirtmaat').closest('tr')!;
    expect(within(rij).queryByTestId('icoon-check')).toBeNull();
    expect(within(rij).getByText('-')).toBeInTheDocument();
    expect(within(rij).getByText('customFields.visibility.self_only')).toBeInTheDocument();
  });

  it('haalt de velden van het gekozen soort op en meldt het als er geen zijn', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /customFields.entityTypes.orchestra/ }));

    await waitFor(() => expect(haal).toHaveBeenCalledWith('orchestra'));
    expect(await screen.findByText('customFields.noFields')).toBeInTheDocument();
    // De velden van het lid staan er niet meer bij: elk soort heeft zijn eigen lijst.
    expect(screen.queryByText('Rijbewijs')).toBeNull();
  });
});

describe('maatwerkvelden - toevoegen', () => {
  it('biedt precies de vier zichtbaarheden en niets daarbuiten', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));

    const venster = await screen.findByRole('dialog');
    const keuze = within(venster).getByDisplayValue('customFields.visibility.all');
    const namen = Array.from(keuze.querySelectorAll('option')).map((o) => o.textContent);

    expect(namen).toEqual([
      'customFields.visibility.all',
      'customFields.visibility.admin_only',
      'customFields.visibility.committee_plus',
      'customFields.visibility.self_only',
    ]);
  });

  it('maakt van een ingetypte sleutel een veilige sleutel', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));

    const venster = await screen.findByRole('dialog');
    const sleutelveld = within(venster).getByPlaceholderText('my_field_key');
    await gebruiker.type(sleutelveld, 'Mijn Veld!');

    // Hoofdletters, spaties en leestekens worden omgezet: de sleutel gaat naar
    // de database en moet er morgen nog hetzelfde uitzien.
    expect(sleutelveld).toHaveValue('mijn_veld_');
  });

  it('stuurt het nieuwe veld met soort en zichtbaarheid mee', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByPlaceholderText('my_field_key'), 'allergie');
    const labels = within(venster).getAllByRole('textbox');
    await gebruiker.type(labels[1], 'Allergie');
    await gebruiker.selectOptions(within(venster).getByDisplayValue('customFields.visibility.all'), 'committee_plus');
    await gebruiker.click(within(venster).getByLabelText('customFields.isRequired'));
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(maak).toHaveBeenCalled());
    expect(maak.mock.calls[0][0]).toMatchObject({
      entityType: 'user',
      fieldKey: 'allergie',
      fieldLabel: 'Allergie',
      visibility: 'committee_plus',
      isRequired: true,
    });
    await waitFor(() => expect(meldingen.goed).toHaveBeenCalledWith('customFields.created'));
  });

  it('vraagt om keuzemogelijkheden zodra het veldtype daarom vraagt', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).queryByLabelText('customFields.options')).toBeNull();
    expect(within(venster).queryByPlaceholderText('customFields.optionsPlaceholder')).toBeNull();

    await gebruiker.selectOptions(within(venster).getByDisplayValue('customFields.fieldTypes.text'), 'select');

    const opties = within(venster).getByPlaceholderText('customFields.optionsPlaceholder');
    await gebruiker.type(opties, 'Klein\n\nGroot\n  ');

    await gebruiker.type(within(venster).getByPlaceholderText('my_field_key'), 'maat');
    await gebruiker.type(within(venster).getAllByRole('textbox')[1], 'Maat');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    // Lege regels en spaties tellen niet mee als keuze.
    await waitFor(() => expect(maak).toHaveBeenCalled());
    expect(maak.mock.calls[0][0]).toMatchObject({ fieldOptions: ['Klein', 'Groot'] });
  });

  it('toont het vakje "zelf te bewerken" alleen bij velden van een lid', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));
    expect(within(await screen.findByRole('dialog')).getByLabelText('customFields.selfEditable')).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    await gebruiker.click(screen.getByRole('button', { name: /customFields.entityTypes.concert/ }));
    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));

    // Bij een concert is er geen "zelf": het vakje hoort er niet te staan.
    expect(within(await screen.findByRole('dialog')).queryByLabelText('customFields.selfEditable')).toBeNull();
  });

  it('meldt de fout van de server als aanmaken wordt geweigerd', async () => {
    maak.mockRejectedValue({ response: { data: { error: 'Deze sleutel bestaat al.' } } });
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /customFields.addField/ }));
    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByPlaceholderText('my_field_key'), 'rijbewijs');
    await gebruiker.type(within(venster).getAllByRole('textbox')[1], 'Rijbewijs');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(meldingen.fout).toHaveBeenCalledWith('Deze sleutel bestaat al.'));
    // Het venster blijft open, zodat de invoer niet verloren gaat.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('maatwerkvelden - wijzigen', () => {
  it('zet de sleutel en het veldtype op slot bij een bestaand veld', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));

    const venster = await screen.findByRole('dialog');
    // De sleutel hangt aan de opgeslagen waarden; hem wijzigen zou die
    // waarden onbereikbaar maken.
    expect(within(venster).getByPlaceholderText('my_field_key')).toBeDisabled();
    expect(within(venster).getByDisplayValue('customFields.fieldTypes.boolean')).toBeDisabled();
    // De zichtbaarheid mag wel: dat is precies wat een beheerder hier komt doen.
    expect(within(venster).getByDisplayValue('customFields.visibility.admin_only')).toBeEnabled();
  });

  it('stuurt bij het wijzigen de sleutel en het soort niet mee', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.selectOptions(within(venster).getByDisplayValue('customFields.visibility.admin_only'), 'all');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(wijzig).toHaveBeenCalled());
    const [id, gegevens] = wijzig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('veld-1');
    expect(gegevens.visibility).toBe('all');
    expect(gegevens).not.toHaveProperty('fieldKey');
    expect(gegevens).not.toHaveProperty('entityType');
  });

  it('neemt de bestaande keuzemogelijkheden over in het venster', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Shirtmaat').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByPlaceholderText('customFields.optionsPlaceholder')).toHaveValue('S\nM\nL');
  });
});

describe('maatwerkvelden - verwijderen', () => {
  it('noemt het veld bij naam in de bevestiging en verwijdert pas daarna', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.delete' }));

    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('customFields.confirmDelete:Rijbewijs')).toBeInTheDocument();
    expect(verwijder).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verwijder).toHaveBeenCalledWith('veld-1'));
    await waitFor(() => expect(meldingen.goed).toHaveBeenCalledWith('customFields.deleted'));
  });

  it('doet niets als de bevestiging wordt afgebroken', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(verwijder).not.toHaveBeenCalled();
  });

  it('meldt de fout van de server als verwijderen wordt geweigerd', async () => {
    verwijder.mockRejectedValue({ response: { data: { error: 'Dit veld is nog in gebruik.' } } });
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Rijbewijs').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }),
    );

    await waitFor(() => expect(meldingen.fout).toHaveBeenCalledWith('Dit veld is nog in gebruik.'));
  });
});
