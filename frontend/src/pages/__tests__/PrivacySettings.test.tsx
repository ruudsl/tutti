/**
 * De pagina waar een lid per veld kiest wie het mag zien.
 *
 * Dit is de plek waar de belofte van de vereniging over privacy wordt
 * waargemaakt of gebroken. Een keuze die op het scherm blijft staan maar niet
 * bij de server aankomt is erger dan geen keuze: het lid denkt dat zijn
 * telefoonnummer afgeschermd is terwijl het gewoon in de ledenlijst staat.
 * Daarom gaat het hier vooral over wat er precies verstuurd wordt.
 *
 * Getest wordt wat het lid ziet en doet: de velden per groep, de huidige
 * zichtbaarheid, een keuze wijzigen, opslaan, en wat er gebeurt als de server
 * nee zegt.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrivacySettings from '../PrivacySettings';
import { getMyPrivacySettings, updateMyPrivacySettings, type PrivacySetting } from '../../api/privacy-settings';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api/privacy-settings', () => ({
  getMyPrivacySettings: vi.fn(),
  updateMyPrivacySettings: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const instellingenOphalen = vi.mocked(getMyPrivacySettings);
const opslaan = vi.mocked(updateMyPrivacySettings);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

function instelling(overschrijving: Partial<PrivacySetting> & { fieldName: string }): PrivacySetting {
  return { visibility: 'all_members', isDefault: true, isRequired: false, ...overschrijving };
}

// Het aangepaste veld heeft een eigen id; dat is wat de server nodig heeft om
// de keuze aan het juiste veld te hangen.
const AANGEPAST_VELD_ID = '11111111-2222-3333-4444-555555555555';

const INSTELLINGEN: Record<string, PrivacySetting> = {
  email: instelling({ fieldName: 'email', visibility: 'orchestra', purposeStatement: 'Voor de ledenlijst' }),
  profile_photo: instelling({ fieldName: 'profile_photo', visibility: 'all_members' }),
  instruments: instelling({ fieldName: 'instruments', visibility: 'section', isRequired: true }),
  orchestras: instelling({ fieldName: 'orchestras', visibility: 'admin_only', isRequired: true }),
  custom_dieet: instelling({
    fieldName: 'custom_dieet',
    fieldLabel: 'Dieetwensen',
    customFieldId: AANGEPAST_VELD_ID,
    visibility: 'committee',
    purposeStatement: 'Voor de catering bij concerten',
  }),
};

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon() {
  render(<PrivacySettings />, { wrapper: Omhulsel });
}

/** De keuzelijst die bij een veld hoort, gevonden via zijn opschrift. */
async function keuzelijst(opschrift: string) {
  const regel = (await screen.findByText(opschrift)).closest('.privacy-field-row')!;
  return within(regel as HTMLElement).getByRole('combobox');
}

beforeEach(() => {
  vi.clearAllMocks();
  instellingenOphalen.mockResolvedValue(INSTELLINGEN);
  opslaan.mockResolvedValue(undefined);
});

describe('PrivacySettings, wat er te zien is', () => {
  it('toont eerst een skelet en daarna de velden per groep', async () => {
    toon();

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);

    expect(await screen.findByText('privacy.groups.contact')).toBeInTheDocument();
    expect(screen.getByText('privacy.groups.musical')).toBeInTheDocument();
    expect(screen.getByText('privacy.fields.email')).toBeInTheDocument();
  });

  it('zet elke keuzelijst op de zichtbaarheid die nu geldt', async () => {
    toon();

    expect(await keuzelijst('privacy.fields.email')).toHaveValue('orchestra');
    expect(await keuzelijst('privacy.fields.profile_photo')).toHaveValue('all_members');
  });

  it('toont waarom de vereniging een veld nodig heeft', async () => {
    toon();

    expect(await screen.findByText('Voor de ledenlijst')).toBeInTheDocument();
  });

  it('merkt verplichte velden aan als verplicht', async () => {
    toon();

    const regel = (await screen.findByText('privacy.fields.instruments')).closest('.privacy-field-row')!;
    expect(within(regel as HTMLElement).getByText('privacy.required')).toBeInTheDocument();
  });

  /**
   * Een verplicht veld dat al op de strengste stand staat kan niet verder
   * dicht; dan is er niets meer te kiezen en gaat de lijst op slot.
   */
  it('zet een verplicht veld op slot zodra het al op de strengste stand staat', async () => {
    toon();

    expect(await keuzelijst('privacy.fields.orchestras')).toBeDisabled();
    expect(await keuzelijst('privacy.fields.instruments')).toBeEnabled();
  });

  it('toont aangepaste velden van de vereniging onder hun eigen kop', async () => {
    toon();

    expect(await screen.findByText('privacy.groups.custom')).toBeInTheDocument();
    expect(screen.getByText('Dieetwensen')).toBeInTheDocument();
    expect(screen.getByText('Voor de catering bij concerten')).toBeInTheDocument();
  });

  it('laat de kop voor aangepaste velden weg als de vereniging er geen heeft', async () => {
    const zonder = { ...INSTELLINGEN };
    delete zonder.custom_dieet;
    instellingenOphalen.mockResolvedValueOnce(zonder);
    toon();

    await screen.findByText('privacy.fields.email');
    expect(screen.queryByText('privacy.groups.custom')).not.toBeInTheDocument();
  });

  it('valt terug op de ruimste stand voor een veld waarover de server niets zegt', async () => {
    instellingenOphalen.mockResolvedValueOnce({ email: INSTELLINGEN.email });
    toon();

    expect(await keuzelijst('privacy.fields.instruments')).toHaveValue('all_members');
  });
});

describe('PrivacySettings, een keuze opslaan', () => {
  it('biedt pas een bewaarknop aan als er iets veranderd is', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');

    expect(screen.queryByRole('button', { name: /common\.save/ })).not.toBeInTheDocument();

    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');

    expect(screen.getByRole('button', { name: /common\.save/ })).toBeInTheDocument();
  });

  it('stuurt alleen de velden die het lid daadwerkelijk aangeraakt heeft', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');

    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');
    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledTimes(1));
    expect(opslaan.mock.calls[0][0]).toEqual([
      { fieldName: 'email', visibility: 'admin_only', customFieldId: undefined },
    ]);
    expect(succes).toHaveBeenCalledWith('privacy.saved');
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. De oude PrivacySettings.tsx
   * stuurde alleen `{ fieldName, visibility }`, ook voor aangepaste velden van
   * de vereniging. De server bewaart zo'n keuze wel, maar zoekt hem bij het
   * teruglezen op via `custom_field_id`; zonder dat id vindt hij hem nooit
   * terug. Het lid zette zijn dieetwensen op 'alleen bestuur', kreeg
   * 'opgeslagen' te zien, en zag na het herladen weer de oude stand staan -
   * en, erger, elders in de applicatie werd de oude zichtbaarheid gebruikt.
   *
   * Gemeten op de oude code: het verstuurde object was
   * `{ fieldName: 'custom_dieet', visibility: 'admin_only' }`, zonder
   * customFieldId. De server overschreef daarbij een eventueel eerder wél
   * goed opgeslagen koppeling met leeg.
   */
  it('stuurt bij een aangepast veld het veld-id mee, anders raakt de keuze zoek', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('Dieetwensen');

    await bediener.selectOptions(await keuzelijst('Dieetwensen'), 'admin_only');
    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledTimes(1));
    expect(opslaan.mock.calls[0][0]).toEqual([
      { fieldName: 'custom_dieet', visibility: 'admin_only', customFieldId: AANGEPAST_VELD_ID },
    ]);
  });

  it('verzamelt meerdere wijzigingen in één keer opslaan', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');

    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');
    await bediener.selectOptions(await keuzelijst('privacy.fields.profile_photo'), 'public');
    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledTimes(1));
    expect(opslaan.mock.calls[0][0]).toHaveLength(2);
  });

  it('laat de bewaarknop verdwijnen zodra alles bewaard is', async () => {
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');
    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');

    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /common\.save/ })).not.toBeInTheDocument());
  });

  it('houdt de wijziging vast als de server hem weigert', async () => {
    opslaan.mockRejectedValueOnce({ response: { data: { error: 'Dit veld moet zichtbaar blijven' } } });
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');
    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');

    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Dit veld moet zichtbaar blijven'));
    // De keuze blijft staan, zodat het lid hem kan bijstellen en opnieuw kan
    // proberen in plaats van opnieuw te moeten beginnen.
    expect(await keuzelijst('privacy.fields.email')).toHaveValue('admin_only');
    expect(screen.getByRole('button', { name: /common\.save/ })).toBeInTheDocument();
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    opslaan.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    toon();
    await screen.findByText('privacy.fields.email');
    await bediener.selectOptions(await keuzelijst('privacy.fields.email'), 'admin_only');

    await bediener.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('privacy.errorSave'));
  });
});
