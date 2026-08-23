/**
 * De poort die nieuwe leden eenmalig langs de privacyverklaring stuurt.
 *
 * Dit component staat vóór de hele applicatie: alles wat erachter zit is
 * onbereikbaar tot het lid akkoord is. Dat maakt twee dingen even belangrijk.
 * Het moet de poort dichthouden voor wie nog niet akkoord is, en het moet hem
 * openlaten voor iedereen die dat al is - inclusief de bezoeker die niet is
 * ingelogd, want die hoort gewoon op het aanmeldscherm te komen en niet op een
 * toestemmingsvraag zonder account.
 *
 * Getest wordt wat het lid ziet en doet: de toestemmingsvraag, de stap met de
 * zichtbaarheid per veld die daarop volgt, overslaan, opslaan, en wat er
 * gebeurt als de server nee zegt.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivacyConsentGate } from '../PrivacyConsentGate';
import {
  checkConsent,
  recordConsent,
  getMyPrivacySettings,
  updateMyPrivacySettings,
  type PrivacySetting,
} from '../../api/privacy-settings';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api/privacy-settings', () => ({
  checkConsent: vi.fn(),
  recordConsent: vi.fn(),
  getMyPrivacySettings: vi.fn(),
  updateMyPrivacySettings: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const auth = vi.hoisted(() => ({ gebruiker: null as { id: string } | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: auth.gebruiker }) }));

const toestemmingNagaan = vi.mocked(checkConsent);
const toestemmingVastleggen = vi.mocked(recordConsent);
const instellingenOphalen = vi.mocked(getMyPrivacySettings);
const instellingenOpslaan = vi.mocked(updateMyPrivacySettings);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

function instelling(overschrijving: Partial<PrivacySetting> & { fieldName: string }): PrivacySetting {
  return { visibility: 'all_members', isDefault: true, isRequired: false, ...overschrijving };
}

const AANGEPAST_VELD_ID = '11111111-2222-3333-4444-555555555555';

const INSTELLINGEN: Record<string, PrivacySetting> = {
  email: instelling({ fieldName: 'email', fieldLabel: 'E-mailadres', purposeStatement: 'Voor de ledenlijst' }),
  phone: instelling({ fieldName: 'phone', fieldLabel: 'Telefoonnummer', isRequired: true, visibility: 'committee' }),
  custom_dieet: instelling({
    fieldName: 'custom_dieet',
    fieldLabel: 'Dieetwensen',
    customFieldId: AANGEPAST_VELD_ID,
    visibility: 'orchestra',
  }),
};

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon() {
  render(
    <PrivacyConsentGate>
      <p>de applicatie</p>
    </PrivacyConsentGate>,
    { wrapper: Omhulsel },
  );
}

/** De keuzelijst die bij een veld hoort, gevonden via zijn opschrift. */
function keuzelijst(opschrift: string) {
  const regel = screen.getByText(opschrift).closest('div.flex')!;
  return within(regel as HTMLElement).getByRole('combobox');
}

/** Doorloopt de toestemmingsstap en blijft staan op de zichtbaarheidsstap. */
async function totDeZichtbaarheid(bediener: ReturnType<typeof userEvent.setup>) {
  await bediener.click(await screen.findByRole('button', { name: 'privacy.agreeAndContinue' }));
  await screen.findByText('privacy.settingsTitle');
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.gebruiker = { id: 'lid-1' };
  toestemmingNagaan.mockResolvedValue({ hasConsented: false });
  toestemmingVastleggen.mockResolvedValue({ message: 'ok', id: 'toestemming-1' });
  instellingenOphalen.mockResolvedValue(INSTELLINGEN);
  instellingenOpslaan.mockResolvedValue(undefined);
});

describe('PrivacyConsentGate, wie er doorgelaten wordt', () => {
  it('laat een bezoeker zonder account meteen door', async () => {
    auth.gebruiker = null;
    toon();

    expect(await screen.findByText('de applicatie')).toBeInTheDocument();
    expect(toestemmingNagaan).not.toHaveBeenCalled();
  });

  it('laat een lid dat al akkoord is meteen door', async () => {
    toestemmingNagaan.mockResolvedValueOnce({ hasConsented: true, consentedAt: '2026-01-01T00:00:00.000Z' });
    toon();

    expect(await screen.findByText('de applicatie')).toBeInTheDocument();
    expect(screen.queryByText('privacy.consentTitle')).not.toBeInTheDocument();
  });

  it('laat de applicatie ongemoeid zolang nog niet bekend is of er toestemming is', async () => {
    toestemmingNagaan.mockImplementation(() => new Promise(() => {}));
    toon();

    expect(await screen.findByText('de applicatie')).toBeInTheDocument();
    expect(screen.queryByText('privacy.consentTitle')).not.toBeInTheDocument();
  });

  it('houdt de applicatie achter de toestemmingsvraag voor wie nog niet akkoord is', async () => {
    toon();

    expect(await screen.findByText('privacy.consentTitle')).toBeInTheDocument();
    expect(screen.queryByText('de applicatie')).not.toBeInTheDocument();
  });
});

describe('PrivacyConsentGate, de toestemmingsstap', () => {
  it('vertelt wat er wordt vastgelegd en welke rechten het lid heeft', async () => {
    toon();
    await screen.findByText('privacy.consentTitle');

    expect(screen.getByText('privacy.collectContactInfo')).toBeInTheDocument();
    expect(screen.getByText('privacy.collectMembership')).toBeInTheDocument();
    expect(screen.getByText('privacy.rightExport')).toBeInTheDocument();
    expect(screen.getByText('privacy.rightDelete')).toBeInTheDocument();
  });

  it('legt de toestemming vast en gaat door naar de zichtbaarheid', async () => {
    const bediener = userEvent.setup();
    toon();

    await totDeZichtbaarheid(bediener);

    expect(toestemmingVastleggen).toHaveBeenCalledTimes(1);
    expect(toestemmingVastleggen.mock.calls[0][0]).toBe('1.0');
    expect(screen.getByText('E-mailadres')).toBeInTheDocument();
  });

  it('blijft staan en meldt het als de toestemming niet vastgelegd kan worden', async () => {
    toestemmingVastleggen.mockRejectedValueOnce({ response: { data: { error: 'Server niet bereikbaar' } } });
    const bediener = userEvent.setup();
    toon();

    await bediener.click(await screen.findByRole('button', { name: 'privacy.agreeAndContinue' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Server niet bereikbaar'));
    expect(screen.getByText('privacy.consentTitle')).toBeInTheDocument();
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    toestemmingVastleggen.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    toon();

    await bediener.click(await screen.findByRole('button', { name: 'privacy.agreeAndContinue' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('privacy.errorConsent'));
  });

  it('vraagt de zichtbaarheid pas op als het lid daadwerkelijk zover is', async () => {
    toon();
    await screen.findByText('privacy.consentTitle');

    expect(instellingenOphalen).not.toHaveBeenCalled();
  });
});

describe('PrivacyConsentGate, de zichtbaarheidsstap', () => {
  it('toont per veld het opschrift, het doel en de huidige stand', async () => {
    const bediener = userEvent.setup();
    toon();

    await totDeZichtbaarheid(bediener);

    expect(screen.getByText('Voor de ledenlijst')).toBeInTheDocument();
    expect(keuzelijst('Dieetwensen')).toHaveValue('orchestra');
  });

  it('zet een veld dat de vereniging verplicht stelt op slot', async () => {
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    expect(keuzelijst('Telefoonnummer')).toBeDisabled();
    expect(screen.getByText('privacy.requiredByAssociation')).toBeInTheDocument();
  });

  it('laat het lid de stap overslaan zonder iets te bewaren', async () => {
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    await bediener.click(screen.getByRole('button', { name: 'privacy.skipForNow' }));

    expect(await screen.findByText('de applicatie')).toBeInTheDocument();
    expect(instellingenOpslaan).not.toHaveBeenCalled();
  });

  it('bewaart de keuzes en laat daarna de applicatie zien', async () => {
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    await bediener.selectOptions(keuzelijst('E-mailadres'), 'admin_only');
    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(instellingenOpslaan).toHaveBeenCalledTimes(1));
    expect(instellingenOpslaan.mock.calls[0][0]).toContainEqual(
      expect.objectContaining({ fieldName: 'email', visibility: 'admin_only' }),
    );
    expect(succes).toHaveBeenCalledWith('privacy.saved');
    expect(await screen.findByText('de applicatie')).toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. De oude
   * PrivacyConsentGate.tsx stuurde per veld alleen `{ fieldName, visibility }`.
   * Voor aangepaste velden van de vereniging is dat te weinig: de server hangt
   * die keuze aan `custom_field_id` en vindt hem zonder dat id nooit terug.
   * Juist hier telt dat zwaar, want dit is het scherm waarop het lid zijn
   * keuze voor het eerst maakt - en dus de keuze die daarna geldt.
   *
   * Gemeten op de oude code: het object voor 'custom_dieet' kwam zonder
   * customFieldId binnen.
   */
  it('stuurt bij een aangepast veld het veld-id mee, anders raakt de keuze zoek', async () => {
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    await bediener.selectOptions(keuzelijst('Dieetwensen'), 'admin_only');
    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(instellingenOpslaan).toHaveBeenCalledTimes(1));
    expect(instellingenOpslaan.mock.calls[0][0]).toContainEqual({
      fieldName: 'custom_dieet',
      visibility: 'admin_only',
      customFieldId: AANGEPAST_VELD_ID,
    });
  });

  it('blijft staan en meldt het als bewaren mislukt', async () => {
    instellingenOpslaan.mockRejectedValueOnce({ response: { data: { error: 'Telefoonnummer moet zichtbaar zijn' } } });
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Telefoonnummer moet zichtbaar zijn'));
    expect(screen.getByText('privacy.settingsTitle')).toBeInTheDocument();
    expect(screen.queryByText('de applicatie')).not.toBeInTheDocument();
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    instellingenOpslaan.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    toon();
    await totDeZichtbaarheid(bediener);

    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('privacy.errorSave'));
  });

  it('toont dat er geladen wordt zolang de velden nog onderweg zijn', async () => {
    instellingenOphalen.mockImplementation(() => new Promise(() => {}));
    const bediener = userEvent.setup();
    toon();

    await bediener.click(await screen.findByRole('button', { name: 'privacy.agreeAndContinue' }));

    expect(await screen.findByText('privacy.settingsTitle')).toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });
});
