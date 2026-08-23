/**
 * Tweestapsverificatie aan- en uitzetten vanuit het profiel.
 *
 * Dit is een van de weinige schermen waar een verkeerde handeling het account
 * onbereikbaar maakt. Wat hier vastligt is de hele weg die het lid aflegt: de
 * huidige stand zien, het instellen starten, de code intikken, de eenmalige
 * herstelcodes te zien krijgen en die kunnen kopiëren, en het weer uitzetten
 * met een wachtwoord. Elke serveraanroep kan mislukken, en dat is telkens een
 * gewone toestand om te tonen, geen uitzondering.
 *
 * OVER DE TESTGEGEVENS: alles wat hier op een sleutel of een code lijkt is
 * opzettelijk saai en herhalend gekozen - 'VOORBEELD-GEEN-ECHTE-SLEUTEL',
 * 'aaaa-1111'. Een realistisch ogende TOTP-sleutel of herstelcode heeft genoeg
 * wanorde in zich om door een geheimenscanner als echt gelezen te worden, en
 * die blokkade omzeilen we niet; dan kiezen we een ander testgegeven.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaSettings } from '../MfaSettings';
import { setupMfa, enableMfa, disableMfa } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api', () => ({
  setupMfa: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const auth = vi.hoisted(() => ({
  gebruiker: { id: 'lid-1', mfaEnabled: false } as { id: string; mfaEnabled: boolean } | null,
  profielVerversen: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.gebruiker, refreshProfile: auth.profielVerversen }),
}));

const instellen = vi.mocked(setupMfa);
const inschakelen = vi.mocked(enableMfa);
const uitschakelen = vi.mocked(disableMfa);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

// Geen echte sleutel en geen echte QR-afbeelding: een pad en een zin.
const OPZET = { qrCode: '/voorbeeld-qr.png', secret: 'VOORBEELD-GEEN-ECHTE-SLEUTEL' };
const HERSTELCODES = ['aaaa-1111', 'bbbb-2222', 'cccc-3333'];

let naarKlembord: ReturnType<typeof vi.fn>;

/**
 * Zet de klemborddubbelganger neer.
 *
 * Dit moet ná `userEvent.setup()` gebeuren: user-event hangt zelf een
 * klembordvervanger aan `navigator` en zou de onze anders overschrijven.
 */
function stelKlembordIn() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: naarKlembord },
  });
  return naarKlembord;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.gebruiker = { id: 'lid-1', mfaEnabled: false };
  auth.profielVerversen.mockResolvedValue(undefined);
  instellen.mockResolvedValue(OPZET as never);
  inschakelen.mockResolvedValue({ message: 'ok', mfaEnabled: true } as never);
  uitschakelen.mockResolvedValue({ message: 'ok', mfaEnabled: false } as never);
  naarKlembord = vi.fn().mockResolvedValue(undefined);
});

/** Opent het instelvenster en geeft dat venster terug. */
async function startInstellen(bediener: ReturnType<typeof userEvent.setup>) {
  await bediener.click(screen.getByRole('button', { name: 'mfa.enable' }));
  return await screen.findByRole('dialog');
}

describe('MfaSettings, de stand tonen', () => {
  it('toont dat tweestapsverificatie uit staat, met de knop om hem aan te zetten', () => {
    render(<MfaSettings />);

    expect(screen.getByText('mfa.disabled')).toBeInTheDocument();
    expect(screen.getByText('mfa.disabledDescription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mfa.enable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'mfa.disable' })).not.toBeInTheDocument();
  });

  it('toont dat hij aan staat, met de knop om hem uit te zetten', () => {
    auth.gebruiker = { id: 'lid-1', mfaEnabled: true };

    render(<MfaSettings />);

    expect(screen.getByText('mfa.enabled')).toBeInTheDocument();
    expect(screen.getByText('mfa.enabledDescription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mfa.disable' })).toBeInTheDocument();
  });

  it('gaat uit van uitgeschakeld als er nog geen profiel geladen is', () => {
    auth.gebruiker = null;

    render(<MfaSettings />);

    expect(screen.getByText('mfa.disabled')).toBeInTheDocument();
  });
});

describe('MfaSettings, instellen', () => {
  it('toont de QR-code en de handmatige code na het starten', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);

    const venster = await startInstellen(bediener);

    expect(instellen).toHaveBeenCalledTimes(1);
    expect(within(venster).getByRole('img', { name: 'MFA QR Code' })).toHaveAttribute('src', '/voorbeeld-qr.png');
    expect(within(venster).getByText('VOORBEELD-GEEN-ECHTE-SLEUTEL')).toBeInTheDocument();
  });

  it('meldt het als het starten mislukt en opent geen venster', async () => {
    instellen.mockRejectedValueOnce({ response: { data: { error: 'Authenticator niet beschikbaar' } } });
    const bediener = userEvent.setup();
    render(<MfaSettings />);

    await bediener.click(screen.getByRole('button', { name: 'mfa.enable' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Authenticator niet beschikbaar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    instellen.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    render(<MfaSettings />);

    await bediener.click(screen.getByRole('button', { name: 'mfa.enable' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('mfa.errorSetup'));
  });

  it('houdt alleen cijfers over en stopt bij zes', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startInstellen(bediener);
    const veld = within(venster).getByRole('textbox');

    await bediener.type(veld, 'a1b2c3d4e5f6g7');

    expect(veld).toHaveValue('123456');
  });

  it('houdt de activeerknop op slot tot de code compleet is', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startInstellen(bediener);
    const activeren = within(venster).getByRole('button', { name: 'mfa.activate' });

    expect(activeren).toBeDisabled();
    await bediener.type(within(venster).getByRole('textbox'), '12345');
    expect(activeren).toBeDisabled();

    await bediener.type(within(venster).getByRole('textbox'), '6');
    expect(activeren).toBeEnabled();
  });

  it('sluit het venster als de server geen herstelcodes teruggeeft', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startInstellen(bediener);

    await bediener.type(within(venster).getByRole('textbox'), '123456');
    await bediener.click(within(venster).getByRole('button', { name: 'mfa.activate' }));

    await waitFor(() => expect(inschakelen).toHaveBeenCalledWith('123456'));
    expect(succes).toHaveBeenCalledWith('mfa.enableSuccess');
    expect(auth.profielVerversen).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt het als het inschakelen mislukt en houdt het venster open', async () => {
    inschakelen.mockRejectedValueOnce({ response: { data: { error: 'Code klopt niet' } } });
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startInstellen(bediener);

    await bediener.type(within(venster).getByRole('textbox'), '000000');
    await bediener.click(within(venster).getByRole('button', { name: 'mfa.activate' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Code klopt niet'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(auth.profielVerversen).not.toHaveBeenCalled();
  });

  it('laat het instellen los als de gebruiker afziet', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startInstellen(bediener);
    await bediener.type(within(venster).getByRole('textbox'), '123456');

    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Opnieuw beginnen levert een schoon venster op, niet de oude code.
    const opnieuw = await startInstellen(bediener);
    expect(within(opnieuw).getByRole('textbox')).toHaveValue('');
  });
});

describe('MfaSettings, de eenmalige herstelcodes', () => {
  beforeEach(() => {
    inschakelen.mockResolvedValue({ message: 'ok', mfaEnabled: true, recoveryCodes: HERSTELCODES } as never);
  });

  /** Schakelt in en blijft staan op het venster met de herstelcodes. */
  async function totDeHerstelcodes(bediener: ReturnType<typeof userEvent.setup>) {
    const venster = await startInstellen(bediener);
    await bediener.type(within(venster).getByRole('textbox'), '123456');
    await bediener.click(within(venster).getByRole('button', { name: 'mfa.activate' }));
    return await screen.findByRole('dialog');
  }

  it('toont de codes met de waarschuwing dat ze maar één keer te zien zijn', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);

    const venster = await totDeHerstelcodes(bediener);

    await waitFor(() => expect(within(venster).getByText('aaaa-1111')).toBeInTheDocument());
    expect(within(venster).getByText('bbbb-2222')).toBeInTheDocument();
    expect(within(venster).getByText('cccc-3333')).toBeInTheDocument();
    expect(within(venster).getByText('mfa.recoveryCodesWarning')).toBeInTheDocument();
  });

  it('kopieert alle codes onder elkaar naar het klembord', async () => {
    const bediener = userEvent.setup();
    stelKlembordIn();
    render(<MfaSettings />);
    const venster = await totDeHerstelcodes(bediener);
    await within(venster).findByText('aaaa-1111');

    await bediener.click(within(venster).getByRole('button', { name: 'mfa.recoveryCodesCopy' }));

    await waitFor(() => expect(naarKlembord).toHaveBeenCalledWith('aaaa-1111\nbbbb-2222\ncccc-3333'));
    expect(succes).toHaveBeenCalledWith('mfa.recoveryCodesCopied');
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Op de oude MfaSettings.tsx
   * kwam hier 'mfa.errorEnable' uit: mislukte het kopiëren, dan kreeg het lid
   * te lezen dat het inschakelen was mislukt - terwijl dat net gelukt was en
   * de codes gewoon in beeld stonden. Wie dat gelooft gaat op zoek naar een
   * probleem dat er niet is en laat de codes ongelezen wegklikken.
   *
   * De reparatie meldt niets meer via een melding die iets anders beweert; de
   * codes staan in beeld en zijn met de hand te selecteren.
   */
  it('beweert niet dat het inschakelen mislukt is als alleen het kopiëren faalt', async () => {
    naarKlembord.mockRejectedValueOnce(new Error('geen toegang tot het klembord'));
    const bediener = userEvent.setup();
    stelKlembordIn();
    render(<MfaSettings />);
    const venster = await totDeHerstelcodes(bediener);
    await within(venster).findByText('aaaa-1111');

    await bediener.click(within(venster).getByRole('button', { name: 'mfa.recoveryCodesCopy' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('errors.generic'));
    expect(fout).not.toHaveBeenCalledWith('mfa.errorEnable');
    // De codes blijven staan, want dat is wat het lid nu nodig heeft.
    expect(within(venster).getByText('aaaa-1111')).toBeInTheDocument();
  });

  it('sluit het venster pas als het lid zegt dat hij ze heeft', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await totDeHerstelcodes(bediener);
    await within(venster).findByText('aaaa-1111');

    await bediener.click(within(venster).getByRole('button', { name: 'mfa.recoveryCodesDone' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('MfaSettings, uitschakelen', () => {
  beforeEach(() => {
    auth.gebruiker = { id: 'lid-1', mfaEnabled: true };
  });

  /** Opent het uitschakelvenster en geeft dat venster terug. */
  async function startUitschakelen(bediener: ReturnType<typeof userEvent.setup>) {
    await bediener.click(screen.getByRole('button', { name: 'mfa.disable' }));
    return await screen.findByRole('dialog');
  }

  it('vraagt om het wachtwoord en houdt de knop op slot zolang dat leeg is', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);

    const venster = await startUitschakelen(bediener);

    expect(within(venster).getByText('mfa.disablePrompt')).toBeInTheDocument();
    expect(within(venster).getByRole('button', { name: 'mfa.disable' })).toBeDisabled();
  });

  it('schakelt uit met het ingetikte wachtwoord en ververst het profiel', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startUitschakelen(bediener);

    await bediener.type(within(venster).getByLabelText('mfa.password'), 'mijn-wachtwoord');
    await bediener.click(within(venster).getByRole('button', { name: 'mfa.disable' }));

    await waitFor(() => expect(uitschakelen).toHaveBeenCalledWith('mijn-wachtwoord'));
    expect(succes).toHaveBeenCalledWith('mfa.disableSuccess');
    expect(auth.profielVerversen).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt een verkeerd wachtwoord en houdt het venster open', async () => {
    uitschakelen.mockRejectedValueOnce({ response: { data: { error: 'Wachtwoord onjuist' } } });
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startUitschakelen(bediener);

    await bediener.type(within(venster).getByLabelText('mfa.password'), 'fout');
    await bediener.click(within(venster).getByRole('button', { name: 'mfa.disable' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Wachtwoord onjuist'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('vergeet het ingetikte wachtwoord als de gebruiker afziet', async () => {
    const bediener = userEvent.setup();
    render(<MfaSettings />);
    const venster = await startUitschakelen(bediener);
    await bediener.type(within(venster).getByLabelText('mfa.password'), 'mijn-wachtwoord');

    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const opnieuw = await startUitschakelen(bediener);
    expect(within(opnieuw).getByLabelText('mfa.password')).toHaveValue('');
    expect(uitschakelen).not.toHaveBeenCalled();
  });
});
