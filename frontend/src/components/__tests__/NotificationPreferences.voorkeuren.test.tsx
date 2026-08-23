/**
 * Meldingsvoorkeuren van één lid.
 *
 * Dit scherm gaat over instellingen die ooit van iedereen tegelijk waren in
 * plaats van per lid. De serverkant is daarvoor gerepareerd; wat hier telt is
 * dat de component zich daarbij netjes gedraagt: hij haalt de voorkeuren van
 * de ingelogde gebruiker op, toont precies die stand (en niet een rij vinkjes
 * die standaard aan staan), en stuurt bij het bewaren dezelfde stand terug -
 * inclusief de kanalen die de gebruiker niet heeft aangeraakt. Zet een test
 * een enkel vinkje om, dan mag alleen dat ene veld in de opdracht veranderen.
 *
 * Verder: koppelen en ontkoppelen van Telegram en WhatsApp, en wat de
 * gebruiker ziet als een van die stappen misgaat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationPreferences from '../NotificationPreferences';
import * as api from '../../api';
import type { NotificationChannel, NotificationPreferences as Voorkeuren } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api', () => ({
  getNotificationChannels: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  getTelegramLinkUrl: vi.fn(),
  unlinkTelegram: vi.fn(),
  linkWhatsApp: vi.fn(),
  verifyWhatsApp: vi.fn(),
  unlinkWhatsApp: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

function maakKanalen(overschrijving: Partial<Record<string, boolean>> = {}): NotificationChannel[] {
  return [
    { channel: 'email', configured: true, name: 'E-mail' },
    { channel: 'push', configured: overschrijving.push ?? true, name: 'Push' },
    { channel: 'telegram', configured: overschrijving.telegram ?? true, name: 'Telegram' },
    { channel: 'whatsapp', configured: overschrijving.whatsapp ?? true, name: 'WhatsApp' },
  ];
}

/**
 * De voorkeuren zoals de server ze voor dít lid teruggeeft. Bewust een stand
 * die van de standaardwaarden afwijkt: e-mail uit, chatberichten uit. Zou het
 * scherm terugvallen op zijn eigen standaardwaarden, dan valt dat op.
 */
function maakVoorkeuren(overschrijving: Partial<Voorkeuren> = {}): Voorkeuren {
  return {
    userId: 'lid-1',
    channels: {
      email: { enabled: false, address: 'anna@harmonie.nl' },
      push: { enabled: true },
      whatsapp: { enabled: false, verified: false },
      telegram: { enabled: false, verified: false },
      ...(overschrijving.channels ?? {}),
    },
    notificationTypes: {
      new_music: { enabled: true, channels: ['email'] },
      rehearsal_change: { enabled: true, channels: ['email'] },
      seating_update: { enabled: false, channels: [] },
      chat_message: { enabled: false, channels: [] },
      practice_reminder: { enabled: true, channels: ['email'] },
      concert_reminder: { enabled: true, channels: ['email'] },
      ...(overschrijving.notificationTypes ?? {}),
    },
    ...overschrijving,
  } as Voorkeuren;
}

function stelServerIn(voorkeuren: Voorkeuren = maakVoorkeuren(), kanalen: NotificationChannel[] = maakKanalen()) {
  vi.mocked(api.getNotificationChannels).mockResolvedValue(kanalen);
  vi.mocked(api.getNotificationPreferences).mockResolvedValue(voorkeuren);
}

async function toon(alsGesloten?: () => void) {
  const gebruiker = userEvent.setup();
  render(<NotificationPreferences onClose={alsGesloten} />);
  await screen.findByRole('button', { name: 'common.save' });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.updateNotificationPreferences).mockResolvedValue(undefined);
});

describe('meldingsvoorkeuren - bewaren van de stand van dit lid', () => {
  it('toont de opgehaalde stand in plaats van standaard alles aan', async () => {
    stelServerIn();
    await toon();

    expect(screen.getByRole('checkbox', { name: /channels\.email/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /channels\.push/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'notificationPrefs.types.chatMessages' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'notificationPrefs.types.newMusic' })).toBeChecked();
    // Het e-mailadres van dit lid staat erbij, zodat zichtbaar is wiens
    // instellingen dit zijn.
    expect(screen.getByText('(anna@harmonie.nl)')).toBeInTheDocument();
  });

  it('bewaart één omgezet vinkje en laat de rest van de stand ongemoeid', async () => {
    stelServerIn();
    const sluit = vi.fn();
    const gebruiker = await toon(sluit);

    await gebruiker.click(screen.getByRole('checkbox', { name: 'notificationPrefs.types.chatMessages' }));
    expect(screen.getByRole('checkbox', { name: 'notificationPrefs.types.chatMessages' })).toBeChecked();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
      emailEnabled: false,
      pushEnabled: true,
      whatsappEnabled: false,
      telegramEnabled: false,
      newMusic: true,
      rehearsalChanges: true,
      seatingUpdates: false,
      chatMessages: true,
      practiceReminders: true,
      concertReminders: true,
    });
    expect(showSuccess).toHaveBeenCalledWith('notificationPrefs.saved');
    expect(sluit).toHaveBeenCalled();
  });

  it('zet een kanaal uit en stuurt dat mee', async () => {
    stelServerIn();
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('checkbox', { name: /channels\.push/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalled());
    expect(vi.mocked(api.updateNotificationPreferences).mock.calls[0][0]).toMatchObject({
      pushEnabled: false,
      emailEnabled: false,
    });
  });

  it('meldt het als bewaren mislukt en laat het venster openstaan', async () => {
    stelServerIn();
    vi.mocked(api.updateNotificationPreferences).mockRejectedValue(new Error('502'));
    const sluit = vi.fn();
    const gebruiker = await toon(sluit);

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('notificationPrefs.saveError'));
    expect(sluit).not.toHaveBeenCalled();
    // De knop staat weer klaar voor een tweede poging.
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
  });

  it('een kanaal dat de server niet ondersteunt is niet aan te zetten', async () => {
    stelServerIn(maakVoorkeuren(), maakKanalen({ push: false }));
    await toon();

    expect(screen.getByRole('checkbox', { name: /channels\.push/ })).toBeDisabled();
    expect(screen.getAllByText('(notificationPrefs.channels.notConfigured)').length).toBeGreaterThan(0);
  });
});

describe('meldingsvoorkeuren - gekoppelde kanalen aanzetten', () => {
  const gekoppeld = () =>
    maakVoorkeuren({
      channels: {
        email: { enabled: false, address: 'anna@harmonie.nl' },
        push: { enabled: true },
        whatsapp: { enabled: false, verified: true, phoneNumber: '+31612345678' },
        telegram: { enabled: false, verified: true, chatId: '99' },
      },
    });

  it('zet e-mail, Telegram en WhatsApp aan en stuurt alle drie mee', async () => {
    stelServerIn(gekoppeld());
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('checkbox', { name: /channels\.email/ }));
    await gebruiker.click(screen.getByRole('checkbox', { name: /channels\.telegram/ }));
    await gebruiker.click(screen.getByRole('checkbox', { name: /channels\.whatsapp/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalled());
    expect(vi.mocked(api.updateNotificationPreferences).mock.calls[0][0]).toMatchObject({
      emailEnabled: true,
      telegramEnabled: true,
      whatsappEnabled: true,
    });
  });

  it('valt terug op een eigen melding als de server geen reden geeft bij ontkoppelen', async () => {
    stelServerIn(gekoppeld());
    vi.mocked(api.unlinkTelegram).mockRejectedValue(new Error('netwerk weg'));
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.unlink' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('notificationPrefs.telegram.unlinkError'));
  });
});

describe('meldingsvoorkeuren - ophalen mislukt', () => {
  it('meldt de laadfout', async () => {
    vi.mocked(api.getNotificationChannels).mockRejectedValue(new Error('offline'));
    vi.mocked(api.getNotificationPreferences).mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<NotificationPreferences />);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('notificationPrefs.loadError'));
  });

  /**
   * BEWIJS bij de reparatie in NotificationPreferences.handleSave.
   *
   * Mislukt het ophalen, dan blijft `preferences` leeg maar wordt het
   * formulier toch getekend - met overal het standaardvinkje aan. Drukte de
   * gebruiker dan op Bewaren, dan viel `handleSave` stilletjes uit op
   * `if (!preferences) return;`: geen verzoek, geen melding, geen enkel spoor.
   * Op het scherm leek het alsof de instellingen bewaard waren, terwijl er
   * niets was gebeurd - en de gebruiker leest de standaardvinkjes als "alles
   * staat aan".
   *
   * Zonder de reparatie is deze test rood op de regel met showError: er werd
   * geen enkele melding getoond.
   */
  it('meldt dat er niets te bewaren valt in plaats van stilletjes niets te doen', async () => {
    vi.mocked(api.getNotificationChannels).mockRejectedValue(new Error('offline'));
    vi.mocked(api.getNotificationPreferences).mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const gebruiker = userEvent.setup();
    const sluit = vi.fn();

    render(<NotificationPreferences onClose={sluit} />);
    const bewaren = await screen.findByRole('button', { name: 'common.save' });
    vi.mocked(showError).mockClear();

    await gebruiker.click(bewaren);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('notificationPrefs.saveError'));
    expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
    expect(sluit).not.toHaveBeenCalled();
  });
});

describe('meldingsvoorkeuren - Telegram koppelen', () => {
  it('toont de koppelcode en haalt daarna de nieuwe stand op', async () => {
    stelServerIn();
    vi.mocked(api.getTelegramLinkUrl).mockResolvedValue({
      code: 'ABC123',
      url: 'https://t.me/harmoniebot?start=ABC123',
      expiresIn: 600,
    });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.link' }));

    const koppelknop = await screen.findByRole('link', { name: 'notificationPrefs.telegram.openTelegram' });
    expect(koppelknop).toHaveAttribute('href', 'https://t.me/harmoniebot?start=ABC123');
    expect(screen.getByText('ABC123')).toBeInTheDocument();

    // De gebruiker heeft in Telegram bevestigd en vraagt de stand opnieuw op.
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: false, verified: false },
          telegram: { enabled: true, verified: true, chatId: '99' },
        },
      }),
    );
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.checkStatus' }));

    expect(await screen.findByText('notificationPrefs.telegram.linked')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /channels\.telegram/ })).toBeEnabled();
  });

  it('meldt de fout van de server als koppelen mislukt', async () => {
    stelServerIn();
    vi.mocked(api.getTelegramLinkUrl).mockRejectedValue({ response: { data: { error: 'bot niet bereikbaar' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.link' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('bot niet bereikbaar'));
  });

  it('ontkoppelt pas na bevestiging en ververst daarna de stand', async () => {
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: false, verified: false },
          telegram: { enabled: true, verified: true, chatId: '99' },
        },
      }),
    );
    vi.mocked(api.unlinkTelegram).mockResolvedValue(undefined);
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.unlink' }));

    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('notificationPrefs.telegram.unlinkConfirm')).toBeInTheDocument();
    // Zolang er niet bevestigd is, gebeurt er niets.
    expect(api.unlinkTelegram).not.toHaveBeenCalled();

    // De server geeft na het ontkoppelen een ongekoppelde stand terug.
    stelServerIn();
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(api.unlinkTelegram).toHaveBeenCalledTimes(1));
    expect(showSuccess).toHaveBeenCalledWith('notificationPrefs.telegram.unlinked');
    expect(await screen.findByRole('button', { name: 'notificationPrefs.telegram.link' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('laat het venster los als de gebruiker de bevestiging afbreekt', async () => {
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: false, verified: false },
          telegram: { enabled: true, verified: true, chatId: '99' },
        },
      }),
    );
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.telegram.unlink' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.unlinkTelegram).not.toHaveBeenCalled();
  });
});

describe('meldingsvoorkeuren - WhatsApp koppelen', () => {
  it('vraagt eerst om een nummer voordat er een code wordt verstuurd', async () => {
    stelServerIn();
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.sendCode' }));

    expect(showError).toHaveBeenCalledWith('notificationPrefs.whatsapp.phoneRequired');
    expect(api.linkWhatsApp).not.toHaveBeenCalled();
  });

  it('valt terug op een eigen melding als het versturen van de code stukloopt', async () => {
    stelServerIn();
    vi.mocked(api.linkWhatsApp).mockRejectedValue(new Error('netwerk weg'));
    const gebruiker = await toon();

    await gebruiker.type(screen.getByPlaceholderText('+31612345678'), '+31612345678');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.sendCode' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('notificationPrefs.whatsapp.linkError'));
    // Het invoerscherm voor de code komt niet: er is niets verstuurd.
    expect(screen.queryByPlaceholderText('123456')).not.toBeInTheDocument();
  });

  it('stuurt een code, verifieert die en toont het gekoppelde nummer', async () => {
    stelServerIn();
    vi.mocked(api.linkWhatsApp).mockResolvedValue({
      message: 'ok',
      phoneNumber: '+31612345678',
      expiresIn: 600,
    });
    vi.mocked(api.verifyWhatsApp).mockResolvedValue(undefined);
    const gebruiker = await toon();

    await gebruiker.type(screen.getByPlaceholderText('+31612345678'), '+31612345678');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.sendCode' }));

    await waitFor(() => expect(api.linkWhatsApp).toHaveBeenCalledWith('+31612345678'));
    expect(showSuccess).toHaveBeenCalledWith('notificationPrefs.whatsapp.codeSent');

    // Zonder code gebeurt er niets.
    await gebruiker.click(await screen.findByRole('button', { name: 'notificationPrefs.whatsapp.verify' }));
    expect(showError).toHaveBeenCalledWith('notificationPrefs.whatsapp.codeRequired');
    expect(api.verifyWhatsApp).not.toHaveBeenCalled();

    // Met code wel, en daarna staat de nieuwe stand op het scherm.
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: true, verified: true, phoneNumber: '+31612345678' },
          telegram: { enabled: false, verified: false },
        },
      }),
    );
    await gebruiker.type(screen.getByPlaceholderText('123456'), '654321');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.verify' }));

    await waitFor(() => expect(api.verifyWhatsApp).toHaveBeenCalledWith('654321'));
    expect(await screen.findByText('(+31612345678)')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('notificationPrefs.whatsapp.verified');
  });

  it('meldt een afgewezen code en blijft in het invoerscherm staan', async () => {
    stelServerIn();
    vi.mocked(api.linkWhatsApp).mockResolvedValue({ message: 'ok', phoneNumber: '+31612345678', expiresIn: 600 });
    vi.mocked(api.verifyWhatsApp).mockRejectedValue({ response: { data: { error: 'code verlopen' } } });
    const gebruiker = await toon();

    await gebruiker.type(screen.getByPlaceholderText('+31612345678'), '+31612345678');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.sendCode' }));
    await gebruiker.type(await screen.findByPlaceholderText('123456'), '000000');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.verify' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('code verlopen'));
    expect(screen.getByPlaceholderText('123456')).toHaveValue('000000');
  });

  it('kan het invoeren van de code afbreken', async () => {
    stelServerIn();
    vi.mocked(api.linkWhatsApp).mockResolvedValue({ message: 'ok', phoneNumber: '+31612345678', expiresIn: 600 });
    const gebruiker = await toon();

    await gebruiker.type(screen.getByPlaceholderText('+31612345678'), '+31612345678');
    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.sendCode' }));
    await screen.findByPlaceholderText('123456');

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByPlaceholderText('123456')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('+31612345678')).toBeInTheDocument();
  });

  it('ontkoppelt WhatsApp na bevestiging', async () => {
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: true, verified: true, phoneNumber: '+31612345678' },
          telegram: { enabled: false, verified: false },
        },
      }),
    );
    vi.mocked(api.unlinkWhatsApp).mockResolvedValue(undefined);
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.unlink' }));
    const venster = await screen.findByRole('alertdialog');
    stelServerIn();
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(api.unlinkWhatsApp).toHaveBeenCalledTimes(1));
    expect(showSuccess).toHaveBeenCalledWith('notificationPrefs.whatsapp.unlinked');
    expect(await screen.findByPlaceholderText('+31612345678')).toBeInTheDocument();
  });

  it('meldt het als ontkoppelen mislukt', async () => {
    stelServerIn(
      maakVoorkeuren({
        channels: {
          email: { enabled: false, address: 'anna@harmonie.nl' },
          push: { enabled: true },
          whatsapp: { enabled: true, verified: true, phoneNumber: '+31612345678' },
          telegram: { enabled: false, verified: false },
        },
      }),
    );
    vi.mocked(api.unlinkWhatsApp).mockRejectedValue({ response: { data: { error: 'niet gelukt' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'notificationPrefs.whatsapp.unlink' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('niet gelukt'));
    // Het gekoppelde nummer staat er nog: de stand is niet stiekem gewist.
    expect(screen.getByText(/notificationPrefs\.whatsapp\.linked/)).toBeInTheDocument();
  });
});
