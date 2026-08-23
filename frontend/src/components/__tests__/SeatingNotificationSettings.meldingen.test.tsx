/**
 * Instellingen voor de opstellingsmelding: WhatsApp of webhook.
 *
 * Dit scherm bewaart gegevens waarmee namens de vereniging berichten verstuurd
 * worden. Twee dingen zijn daarbij belangrijker dan hoe het eruitziet:
 *
 *   - Er hoort niets van het niet-gekozen kanaal mee te gaan bij het opslaan.
 *     Wie van WhatsApp naar webhook wisselt en opslaat, moet niet alsnog een
 *     account-sid en een token de deur uit sturen. Zie 'stuurt bij een webhook
 *     geen twilio-gegevens mee'.
 *   - Een weigering van de server hoort in beeld te komen met het bericht dat
 *     de server geeft, niet als stilte. Elk van de vier acties (opslaan,
 *     verwijderen, verbinding testen, proefbericht) wordt daarop getest.
 *
 * Wat hier bewust niet getest wordt: `include_image` staat wel in de gegevens
 * maar heeft geen eigen vinkje op het scherm, dus er is geen gebruikershandeling
 * die het omzet. Zolang dat vinkje ontbreekt is het gedrag "altijd een
 * afbeelding meesturen", en dat legt 'stuurt een proefbericht met afbeelding'
 * vast.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatingNotificationSettings from '../SeatingNotificationSettings';
import * as api from '../../api';
import { showError, showSuccess } from '../../utils/toast';
import type { SeatingNotificationSettings as Instellingen } from '../../api';

vi.mock('../../api');
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="bevestigvenster">
      <button onClick={onConfirm}>bevestig</button>
      <button onClick={onCancel}>annuleer</button>
    </div>
  ),
}));

const BEWAARD: Instellingen = {
  id: 'i1',
  orchestra_id: 'ork-1',
  notification_type: 'whatsapp',
  webhook_url: null,
  twilio_account_sid: 'AC123',
  twilio_auth_token: 'geheim',
  twilio_whatsapp_from: '+14155238886',
  twilio_whatsapp_to: '+31612345678, +31687654321',
  minutes_before: 30,
  enabled: true,
  include_image: true,
  message_template: 'Opstelling voor {{datum}}',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(null);
  vi.mocked(api.saveSeatingNotificationSettings).mockResolvedValue(BEWAARD);
  vi.mocked(api.deleteSeatingNotificationSettings).mockResolvedValue({ success: true });
  vi.mocked(api.sendSeatingNotification).mockResolvedValue({ message: 'ok' } as never);
  vi.mocked(api.testTwilioConnection).mockResolvedValue({ message: 'ok' } as never);
});

/** Wacht tot het laadscherm weg is. */
async function toonEnWacht(props: Partial<Parameters<typeof SeatingNotificationSettings>[0]> = {}) {
  render(<SeatingNotificationSettings orchestraId="ork-1" {...props} />);
  await waitFor(() => expect(screen.queryByText('common.loading')).not.toBeInTheDocument());
  return userEvent.setup();
}

describe('meldingsinstellingen - laden en tonen', () => {
  it('haalt de instellingen van het gekozen orkest op en vult het formulier', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    await toonEnWacht();

    expect(api.getSeatingNotificationSettings).toHaveBeenCalledWith('ork-1');
    expect(screen.getByLabelText('Account SID')).toHaveValue('AC123');
    expect(screen.getByLabelText('seating.notifications.twilioTo')).toHaveValue('+31612345678, +31687654321');
    expect(screen.getByLabelText('seating.notifications.minutesBefore')).toHaveValue(30);
    expect(screen.getByLabelText('seating.notifications.messageTemplate')).toHaveValue('Opstelling voor {{datum}}');
  });

  it('toont zonder bewaarde instellingen geen verwijderknop', async () => {
    await toonEnWacht();

    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('seating.notifications.minutesBefore')).toHaveValue(15);
  });

  it('wisselt tussen whatsapp- en webhookvelden', async () => {
    const gebruiker = await toonEnWacht();

    expect(screen.getByLabelText('Account SID')).toBeInTheDocument();
    expect(screen.queryByLabelText('seating.notifications.webhookUrl')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /Webhook/ }));

    expect(screen.getByLabelText('seating.notifications.webhookUrl')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account SID')).not.toBeInTheDocument();
    // De uitleg wisselt mee: bij een webhook hoort het voorbeeldbericht.
    expect(screen.getByText('seating.notifications.webhookFormat')).toBeInTheDocument();
    expect(screen.queryByText('seating.notifications.setupTitle')).not.toBeInTheDocument();
  });

  it('valt terug op vijftien minuten bij een onbruikbaar getal', async () => {
    const gebruiker = await toonEnWacht();

    const veld = screen.getByLabelText('seating.notifications.minutesBefore');
    await gebruiker.clear(veld);

    expect(veld).toHaveValue(15);
  });
});

describe('meldingsinstellingen - opslaan', () => {
  it('stuurt bij een webhook geen twilio-gegevens mee', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: /Webhook/ }));
    await gebruiker.type(screen.getByLabelText('seating.notifications.webhookUrl'), 'https://haak.example/opstelling');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.saveSeatingNotificationSettings).toHaveBeenCalled());
    expect(api.saveSeatingNotificationSettings).toHaveBeenCalledWith('ork-1', {
      notification_type: 'webhook',
      webhook_url: 'https://haak.example/opstelling',
      twilio_account_sid: undefined,
      twilio_auth_token: undefined,
      twilio_whatsapp_from: undefined,
      twilio_whatsapp_to: undefined,
      minutes_before: 30,
      enabled: true,
      include_image: true,
      message_template: 'Opstelling voor {{datum}}',
    });
    expect(showSuccess).toHaveBeenCalledWith('seating.notifications.saved');
  });

  it('stuurt bij whatsapp geen webhook-adres mee en laat het vinkje meelopen', async () => {
    const gebruiker = await toonEnWacht();

    await gebruiker.type(screen.getByLabelText('Account SID'), 'AC999');
    await gebruiker.click(screen.getByLabelText('seating.notifications.enabled'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.saveSeatingNotificationSettings).toHaveBeenCalled());
    expect(api.saveSeatingNotificationSettings).toHaveBeenCalledWith(
      'ork-1',
      expect.objectContaining({
        notification_type: 'whatsapp',
        webhook_url: undefined,
        twilio_account_sid: 'AC999',
        enabled: false,
        message_template: undefined,
      }),
    );
  });

  it('toont de verwijderknop zodra er bewaard is', async () => {
    const gebruiker = await toonEnWacht();

    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByRole('button', { name: 'common.delete' })).toBeInTheDocument();
  });

  it('toont het serverbericht als opslaan wordt geweigerd', async () => {
    vi.mocked(api.saveSeatingNotificationSettings).mockRejectedValue({
      response: { data: { error: 'Webhook-adres ongeldig.' } },
    });
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Webhook-adres ongeldig.'));
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
  });
});

describe('meldingsinstellingen - verbinding testen', () => {
  it('weigert te testen zolang niet alle twilio-velden gevuld zijn', async () => {
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.testConnection' }));

    expect(showError).toHaveBeenCalledWith('seating.notifications.fillAllTwilioFields');
    expect(api.testTwilioConnection).not.toHaveBeenCalled();
  });

  it('test met het eerste nummer uit de lijst', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.testConnection' }));

    await waitFor(() =>
      expect(api.testTwilioConnection).toHaveBeenCalledWith({
        account_sid: 'AC123',
        auth_token: 'geheim',
        whatsapp_from: '+14155238886',
        whatsapp_to: '+31612345678',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('seating.notifications.testSent');
  });

  it('toont het serverbericht als de proefverbinding mislukt', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    vi.mocked(api.testTwilioConnection).mockRejectedValue({
      response: { data: { error: 'Twilio weigert de aanmelding.' } },
    });
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.testConnection' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Twilio weigert de aanmelding.'));
  });
});

describe('meldingsinstellingen - proefbericht', () => {
  it('biedt het proefbericht alleen aan als er een repetitie gekozen is', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    await toonEnWacht();

    expect(screen.queryByRole('button', { name: 'seating.notifications.sendNow' })).not.toBeInTheDocument();
  });

  it('stuurt een proefbericht met afbeelding', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const maakAfbeelding = vi.fn(async () => 'data:image/png;base64,AAA');
    const gebruiker = await toonEnWacht({ rehearsalId: 'rep-1', onCaptureImage: maakAfbeelding });

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.sendNow' }));

    await waitFor(() => expect(api.sendSeatingNotification).toHaveBeenCalledWith('rep-1', 'data:image/png;base64,AAA'));
    expect(maakAfbeelding).toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('seating.notifications.sent');
  });

  it('stuurt zonder afbeelding als er niets te fotograferen valt', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const gebruiker = await toonEnWacht({ rehearsalId: 'rep-1' });

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.sendNow' }));

    await waitFor(() => expect(api.sendSeatingNotification).toHaveBeenCalledWith('rep-1', undefined));
  });

  it('toont het serverbericht als het proefbericht mislukt', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    vi.mocked(api.sendSeatingNotification).mockRejectedValue({
      response: { data: { error: 'Geen opstelling voor deze repetitie.' } },
    });
    const gebruiker = await toonEnWacht({ rehearsalId: 'rep-1' });

    await gebruiker.click(screen.getByRole('button', { name: 'seating.notifications.sendNow' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Geen opstelling voor deze repetitie.'));
  });
});

describe('meldingsinstellingen - verwijderen', () => {
  it('verwijdert na bevestiging en maakt het formulier leeg', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(screen.getByRole('button', { name: 'bevestig' }));

    await waitFor(() => expect(api.deleteSeatingNotificationSettings).toHaveBeenCalledWith('ork-1'));
    expect(showSuccess).toHaveBeenCalledWith('seating.notifications.deleted');
    expect(screen.getByLabelText('Account SID')).toHaveValue('');
    expect(screen.getByLabelText('seating.notifications.minutesBefore')).toHaveValue(15);
    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
  });

  it('verwijdert niets als de bevestiging wordt afgebroken', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(screen.getByRole('button', { name: 'annuleer' }));

    expect(api.deleteSeatingNotificationSettings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('bevestigvenster')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account SID')).toHaveValue('AC123');
  });

  it('toont het serverbericht als verwijderen wordt geweigerd', async () => {
    vi.mocked(api.getSeatingNotificationSettings).mockResolvedValue(BEWAARD);
    vi.mocked(api.deleteSeatingNotificationSettings).mockRejectedValue({
      response: { data: { error: 'Geen rechten voor dit orkest.' } },
    });
    const gebruiker = await toonEnWacht();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(screen.getByRole('button', { name: 'bevestig' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Geen rechten voor dit orkest.'));
    // De bewaarde gegevens blijven staan zolang de server ze niet kwijt is.
    expect(screen.getByLabelText('Account SID')).toHaveValue('AC123');
  });
});
