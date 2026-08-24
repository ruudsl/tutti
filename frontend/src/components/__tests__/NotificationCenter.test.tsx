/**
 * Het meldingenklokje en het voorkeurenscherm eronder.
 *
 * Het klokje is het enige plekje in de balk waar een lid ziet dat er iets is
 * gebeurd. Wat hier getest wordt is dan ook wat een lid ziet en doet: staat het
 * aantal er, gaat het paneel open en dicht zoals verwacht, wordt een melding
 * bij het aanklikken als gelezen weggezet, en zetten de schakelaars de goede
 * voorkeur om.
 *
 * De hooks naar de server zijn afgevangen, dus er gaat geen enkel verzoek uit.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { meldingen } = vi.hoisted(() => ({
  meldingen: {
    lijst: [] as any[],
    lijstLaadt: false,
    aantal: undefined as unknown,
    voorkeuren: undefined as any,
    voorkeurenLaden: false,
    vapidSleutel: undefined as string | undefined,
    markeerGelezen: vi.fn(),
    markeerAllesGelezen: vi.fn(),
    allesBezig: false,
    zetVoorkeur: vi.fn(),
    meldPushAan: vi.fn(),
  },
}));

vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({ data: meldingen.lijst, isLoading: meldingen.lijstLaadt }),
  useUnreadNotificationCount: () => ({ data: meldingen.aantal }),
  useMarkNotificationRead: () => ({ mutateAsync: meldingen.markeerGelezen }),
  useMarkAllNotificationsRead: () => ({ mutate: meldingen.markeerAllesGelezen, isPending: meldingen.allesBezig }),
  useNotificationPreferences: () => ({ data: meldingen.voorkeuren, isLoading: meldingen.voorkeurenLaden }),
  useUpdateNotificationPreferences: () => ({ mutateAsync: meldingen.zetVoorkeur }),
  useVapidPublicKey: () => ({ data: meldingen.vapidSleutel }),
  useRegisterPushSubscription: () => ({ mutateAsync: meldingen.meldPushAan }),
}));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
      i18n: { language: 'nl' },
    }),
  };
});

import { NotificationBell, NotificationPreferencesForm } from '../NotificationCenter';

function melding(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'new_music',
    title: 'Nieuwe bladmuziek',
    body: 'Er staat een nieuw stuk klaar',
    isRead: false,
    createdAt: '2026-08-23T10:00:00.000Z',
    ...extra,
  };
}

function klokje() {
  return screen.getByRole('button', { name: 'Meldingen' });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-08-23T11:00:00.000Z') });
  meldingen.lijst = [];
  meldingen.lijstLaadt = false;
  meldingen.aantal = 0;
  meldingen.voorkeuren = {
    emailEnabled: true,
    pushEnabled: false,
    newMusic: true,
    rehearsalChanges: false,
    seatingUpdates: false,
    chatMessages: true,
    practiceReminders: false,
    concertReminders: true,
  };
  meldingen.voorkeurenLaden = false;
  meldingen.vapidSleutel = undefined;
  meldingen.allesBezig = false;
  meldingen.markeerGelezen.mockReset().mockResolvedValue({});
  meldingen.markeerAllesGelezen.mockReset();
  meldingen.zetVoorkeur.mockReset().mockResolvedValue({});
  meldingen.meldPushAan.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('het klokje', () => {
  it('toont geen getal als er niets ongelezen is', () => {
    meldingen.aantal = 0;

    const { container } = render(<NotificationBell />);

    expect(container.querySelector('.notification-bell-badge')).not.toBeInTheDocument();
  });

  it('toont het aantal ongelezen meldingen', () => {
    meldingen.aantal = 7;

    const { container } = render(<NotificationBell />);

    expect(container.querySelector('.notification-bell-badge')).toHaveTextContent('7');
  });

  it('kort een groot aantal af tot 99+', () => {
    // Anders duwt een lid dat een maand niet gekeken heeft de hele balk scheef.
    meldingen.aantal = 348;

    const { container } = render(<NotificationBell />);

    expect(container.querySelector('.notification-bell-badge')).toHaveTextContent('99+');
  });

  it('leest het aantal ook als de server een object teruggeeft', () => {
    // De hook geeft een getal terug, maar oudere serverversies antwoorden met
    // { count: n }. Het klokje hoort dan geen [object Object] te tonen.
    meldingen.aantal = { count: 4 };

    const { container } = render(<NotificationBell />);

    expect(container.querySelector('.notification-bell-badge')).toHaveTextContent('4');
  });

  it('houdt het paneel dicht tot er geklikt wordt', () => {
    render(<NotificationBell />);

    expect(klokje()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Meldingen' })).not.toBeInTheDocument();
  });

  it('opent en sluit het paneel met een klik op het klokje', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotificationBell />);

    await gebruiker.click(klokje());
    expect(klokje()).toHaveAttribute('aria-expanded', 'true');

    await gebruiker.click(klokje());
    expect(klokje()).toHaveAttribute('aria-expanded', 'false');
  });

  it('sluit het paneel met Escape', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotificationBell />);
    await gebruiker.click(klokje());

    await gebruiker.keyboard('{Escape}');

    expect(klokje()).toHaveAttribute('aria-expanded', 'false');
  });

  it('sluit het paneel bij een klik ernaast', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <div>
        <NotificationBell />
        <button>Ergens anders</button>
      </div>,
    );
    await gebruiker.click(klokje());

    await gebruiker.click(screen.getByRole('button', { name: 'Ergens anders' }));

    expect(klokje()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('de lijst in het paneel', () => {
  it('meldt dat er niets is als de lijst leeg is', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [];
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    expect(screen.getByText('Geen nieuwe meldingen')).toBeInTheDocument();
  });

  it('laat merken dat de lijst nog laadt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijstLaadt = true;
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('zet titel, tekst en hoe lang geleden bij elkaar', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1')];
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    const regel = screen.getByRole('listitem');
    expect(within(regel).getByText('Nieuwe bladmuziek')).toBeInTheDocument();
    expect(within(regel).getByText('Er staat een nieuw stuk klaar')).toBeInTheDocument();
    expect(regel.textContent).toMatch(/geleden/);
  });

  it('vertelt in het voorleeslabel of een melding ongelezen is', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1', { isRead: false }), melding('m2', { title: 'Al gelezen', isRead: true })];
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    const regels = screen.getAllByRole('listitem');
    expect(regels[0]).toHaveAccessibleName(expect.stringContaining('Ongelezen'));
    expect(regels[1]).not.toHaveAccessibleName(expect.stringContaining('Ongelezen'));
    expect(regels[0]).toHaveClass('unread');
    expect(regels[1]).not.toHaveClass('unread');
  });

  it('markeert een ongelezen melding als gelezen zodra hij wordt aangeklikt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1', { isRead: false })];
    render(<NotificationBell />);
    await gebruiker.click(klokje());

    await gebruiker.click(screen.getByRole('listitem'));

    expect(meldingen.markeerGelezen).toHaveBeenCalledWith('m1');
  });

  it('markeert een al gelezen melding niet nog eens', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1', { isRead: true })];
    render(<NotificationBell />);
    await gebruiker.click(klokje());

    await gebruiker.click(screen.getByRole('listitem'));

    expect(meldingen.markeerGelezen).not.toHaveBeenCalled();
  });

  it('sluit het paneel na het aanklikken van een melding', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1', { isRead: true })];
    render(<NotificationBell />);
    await gebruiker.click(klokje());

    await gebruiker.click(screen.getByRole('listitem'));

    await waitFor(() => expect(klokje()).toHaveAttribute('aria-expanded', 'false'));
  });

  it('markeert alles als gelezen op verzoek', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [melding('m1'), melding('m2')];
    render(<NotificationBell />);
    await gebruiker.click(klokje());

    await gebruiker.click(screen.getByRole('button', { name: 'Alles als gelezen markeren' }));

    expect(meldingen.markeerAllesGelezen).toHaveBeenCalled();
  });

  it('zet de knop uit terwijl het markeren loopt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.allesBezig = true;
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    expect(screen.getByRole('button', { name: 'Alles als gelezen markeren' })).toBeDisabled();
  });

  it('geeft elk soort melding zijn eigen pictogram', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.lijst = [
      melding('m1', { type: 'rehearsal_change', title: 'Repetitie verzet' }),
      melding('m2', { type: 'chat_message', title: 'Nieuw bericht' }),
      melding('m3', { type: 'iets_onbekends', title: 'Onbekend soort' }),
    ];
    render(<NotificationBell />);

    await gebruiker.click(klokje());

    const tekens = screen
      .getAllByRole('listitem')
      .map((regel) => regel.querySelector('.notification-item-icon svg')?.getAttribute('class'));
    expect(tekens[0]).toContain('lucide-calendar');
    expect(tekens[1]).not.toBe(tekens[0]);
    // Een onbekend soort valt terug op het klokje in plaats van niets te tonen.
    expect(tekens[2]).toContain('lucide-bell');
  });
});

describe('de voorkeuren', () => {
  it('laat merken dat de voorkeuren nog geladen worden', () => {
    meldingen.voorkeurenLaden = true;

    const { container } = render(<NotificationPreferencesForm />);

    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('zet elke schakelaar op de stand die de server kent', () => {
    render(<NotificationPreferencesForm />);

    expect(screen.getByLabelText('E-mail meldingen')).toBeChecked();
    expect(screen.getByLabelText('Push meldingen')).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Nieuwe muziek/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Repetitie wijzigingen/ })).not.toBeChecked();
  });

  it('slaat het omzetten van een schakelaar meteen op', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotificationPreferencesForm />);

    await gebruiker.click(screen.getByRole('checkbox', { name: /Repetitie wijzigingen/ }));

    expect(meldingen.zetVoorkeur).toHaveBeenCalledWith({ rehearsalChanges: true });
  });

  it('slaat ook het uitzetten op', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotificationPreferencesForm />);

    await gebruiker.click(screen.getByLabelText('E-mail meldingen'));

    expect(meldingen.zetVoorkeur).toHaveBeenCalledWith({ emailEnabled: false });
  });

  it('houdt de push-schakelaar uit als de browser het niet kan', () => {
    // Zonder PushManager is aanzetten zinloos; de schakelaar hoort dan niet te
    // suggereren dat het wel kan.
    render(<NotificationPreferencesForm />);

    expect(screen.getByLabelText('Push meldingen')).toBeDisabled();
  });

  it('noemt elk soort melding met een uitleg erbij', () => {
    render(<NotificationPreferencesForm />);

    expect(screen.getByText('Wanneer er nieuwe bladmuziek wordt toegevoegd')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe berichten in je stemgroep')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });
});

describe('de voorkeuren met push in de browser', () => {
  let abonnement: unknown = null;

  beforeEach(() => {
    abonnement = null;
    (window as any).PushManager = function PushManager() {};
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => abonnement,
            subscribe: vi.fn(async () => ({ endpoint: 'https://voorbeeld.test/nep-abonnement' })),
          },
        }),
      },
    });
    window.atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
  });

  afterEach(() => {
    delete (window as any).PushManager;
  });

  it('biedt aan push aan te zetten zodra dat kan', async () => {
    meldingen.voorkeuren.pushEnabled = true;
    meldingen.vapidSleutel = 'bmVwLXZhcGlkLXNsZXV0ZWw';

    render(<NotificationPreferencesForm />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Push meldingen inschakelen' })).toBeInTheDocument());
    expect(screen.getByLabelText('Push meldingen')).toBeEnabled();
  });

  it('biedt dat niet aan zolang de voorkeur uit staat', async () => {
    meldingen.voorkeuren.pushEnabled = false;
    meldingen.vapidSleutel = 'bmVwLXZhcGlkLXNsZXV0ZWw';

    render(<NotificationPreferencesForm />);

    await waitFor(() => expect(screen.getByLabelText('Push meldingen')).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Push meldingen inschakelen' })).not.toBeInTheDocument();
  });

  it('meldt de browser aan bij de server als er op de knop gedrukt wordt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    meldingen.voorkeuren.pushEnabled = true;
    meldingen.vapidSleutel = 'bmVwLXZhcGlkLXNsZXV0ZWw';
    render(<NotificationPreferencesForm />);
    const knop = await screen.findByRole('button', { name: 'Push meldingen inschakelen' });

    await gebruiker.click(knop);

    await waitFor(() => expect(meldingen.meldPushAan).toHaveBeenCalled());
    // Na het aanmelden is de knop weg: er valt niets meer aan te zetten.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Push meldingen inschakelen' })).not.toBeInTheDocument(),
    );
  });

  it('biedt niets aan zolang de server geen sleutel heeft', async () => {
    meldingen.voorkeuren.pushEnabled = true;
    meldingen.vapidSleutel = undefined;

    render(<NotificationPreferencesForm />);

    await waitFor(() => expect(screen.getByLabelText('Push meldingen')).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Push meldingen inschakelen' })).not.toBeInTheDocument();
  });

  it('houdt het scherm overeind als het aanmelden mislukt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
    meldingen.voorkeuren.pushEnabled = true;
    meldingen.vapidSleutel = 'bmVwLXZhcGlkLXNsZXV0ZWw';
    meldingen.meldPushAan.mockRejectedValue(new Error('server weigert'));
    render(<NotificationPreferencesForm />);
    const knop = await screen.findByRole('button', { name: 'Push meldingen inschakelen' });

    await gebruiker.click(knop);

    await waitFor(() => expect(fouten).toHaveBeenCalled());
    // De knop staat er nog: het is niet gelukt, dus het lid mag het opnieuw proberen.
    expect(screen.getByRole('button', { name: 'Push meldingen inschakelen' })).toBeInTheDocument();
    fouten.mockRestore();
  });
});
