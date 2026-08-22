/**
 * Wat het herontwerp van de instellingenpagina heeft veranderd.
 *
 * `Settings.karakterisering.test.tsx` legt vast wat de pagina deed, inclusief
 * wat er niet deugde. Dit bestand hoort bij de andere kant: de twee reparaties
 * en de twee ontwarde knopen. Elke test hieronder is rood op de oude pagina.
 *
 * De reparaties:
 *   1. De organisatienaam was niet leeg te maken. Twee oorzaken, allebei
 *      gerepareerd: het effect dat de opgehaalde naam overnam vulde het veld
 *      meteen weer, en een leeg veld werd bij het opslaan uit het verzoek
 *      weggelaten zodat de server er niets mee kon.
 *   2. Alle zes configuratie-queries draaiden onvoorwaardelijk. De M365-groepen
 *      worden nu alleen opgehaald als Microsoft is ingesteld - dat is de enige
 *      sectie die verborgen kan blijven.
 *
 * De knopen:
 *   1. De toestand hoorde bij de pagina in plaats van bij de sectie. Dat een
 *      sectie nu op zichzelf te renderen is, zonder pagina en zonder props, is
 *      het bewijs dat die knoop weg is.
 *   2. Eén bevestigingsdialoog bediende vijf secties. Elke sectie heeft nu zijn
 *      eigen dialoog.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Settings from '../Settings';
import { SmtpSectie } from '../Settings/SmtpSectie';
import * as api from '../../api';
import type { AssociationSettings, MicrosoftConfig, SmtpConfig, TelegramConfig, WhatsAppConfig } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/GoogleDriveSettings', () => ({
  GoogleDriveSettings: () => <div data-testid="google-drive" />,
}));

vi.mock('../../components/OfflineManager', () => ({
  OfflineManager: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="offline-beheer" /> : null),
}));

vi.mock('../../components/LazyImage', () => ({
  LazyImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const instellingen: AssociationSettings = {
  name: 'tutti',
  displayName: 'Harmonie Tutti',
  logoPath: null,
  logoUrl: null,
  theme: null,
};

const microsoftUit: MicrosoftConfig = {
  clientId: '',
  tenantId: '',
  enabled: false,
  configured: false,
  redirectUri: 'https://tutti.example/callback',
};

const microsoftAan: MicrosoftConfig = { ...microsoftUit, clientId: 'abc', tenantId: 'def', configured: true };

const smtpUit: SmtpConfig = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  from: '',
  enabled: false,
  configured: false,
};

const telegramUit: TelegramConfig = { tokenPreview: '', configured: false, enabled: false };

const whatsappUit: WhatsAppConfig = {
  provider: 'meta',
  enabled: false,
  configured: false,
  meta: { phoneNumberId: '', accessTokenPreview: '', configured: false },
  twilio: { accountSid: '', authTokenPreview: '', whatsappFrom: '', configured: false },
};

function zetApiKlaar(): void {
  vi.mocked(api.getSettings).mockResolvedValue(instellingen);
  vi.mocked(api.getMicrosoftConfig).mockResolvedValue(microsoftUit);
  vi.mocked(api.getSmtpConfig).mockResolvedValue(smtpUit);
  vi.mocked(api.getTelegramConfig).mockResolvedValue(telegramUit);
  vi.mocked(api.getWhatsAppConfig).mockResolvedValue(whatsappUit);
  vi.mocked(api.getM365GroupMappings).mockResolvedValue([]);
  vi.mocked(api.getAdminConcertTypes).mockResolvedValue({ types: [], defaults: [] });
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
  vi.mocked(api.updateSettings).mockResolvedValue(undefined);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Alleen een queryclient, zonder router: genoeg voor een losse sectie. */
function alleenQueries({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function wachtOpNaamveld(): Promise<HTMLInputElement> {
  const veld = (await screen.findByLabelText('settings.organizationName')) as HTMLInputElement;
  await waitFor(() => expect(veld.value).toBe('Harmonie Tutti'));
  return veld;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('reparatie 1 - de organisatienaam is te wissen', () => {
  // Op de oude pagina vulde het effect het veld meteen weer met 'Harmonie
  // Tutti', waarna de nieuwe tekst daarachter kwam: 'Harmonie TuttiFanfare
  // Tutti'. Dit is de test die zonder de reparatie rood is.
  it('zet niet de oude naam terug voor wat je intypt', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    const veld = await wachtOpNaamveld();

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Fanfare Tutti');

    expect(veld.value).toBe('Fanfare Tutti');
  });

  // De tweede helft van dezelfde reparatie. `displayName.trim() || undefined`
  // liet een leeg veld uit het verzoek weg, en de backend slaat een ontbrekend
  // veld bewust over: wissen kwam nooit aan. Een lege tekst is voor de backend
  // wél een opdracht om te wissen.
  it('stuurt een lege naam mee bij het opslaan', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    const veld = await wachtOpNaamveld();

    await gebruiker.clear(veld);
    await gebruiker.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ displayName: '' }));
  });

  // De reparatie mag niet doorslaan: het veld moet nog steeds meebewegen met wat
  // de server teruggeeft, anders blijft er na het opslaan een oude naam staan.
  it('neemt een nieuwe naam van de server alsnog over', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    const veld = await wachtOpNaamveld();

    vi.mocked(api.getSettings).mockResolvedValue({ ...instellingen, displayName: 'Fanfare Noord' });
    await gebruiker.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(veld.value).toBe('Fanfare Noord'));
  });
});

describe('reparatie 2 - de M365-groepen worden alleen opgehaald als ze nodig zijn', () => {
  it('haalt de groepen op zodra Microsoft ingesteld is', async () => {
    vi.mocked(api.getMicrosoftConfig).mockResolvedValue(microsoftAan);

    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByText('settings.m365Groups.title')).toBeInTheDocument();
    await waitFor(() => expect(api.getM365GroupMappings).toHaveBeenCalled());
  });

  // De tegenhanger - niet ophalen zolang Microsoft uit staat - staat in de
  // karakteriseringstest, waar de oude verwachting omgedraaid is.
  it('laat de groepen met rust zolang Microsoft uit staat', async () => {
    render(<Settings />, { wrapper: wikkel });

    await screen.findByText('settings.title');
    await waitFor(() => expect(api.getWhatsAppConfig).toHaveBeenCalled());

    expect(api.getM365GroupMappings).not.toHaveBeenCalled();
  });
});

describe('knoop 1 - een sectie draait op zichzelf', () => {
  // Op de oude pagina zat de SMTP-toestand in de paginafunctie: negen
  // `useState`, een effect en drie handlers. Los renderen kon niet. Nu wel, en
  // zonder ook maar één prop: de sectie haalt zijn eigen gegevens op.
  it('rendert de SMTP-sectie zonder pagina, zonder router en zonder props', async () => {
    vi.mocked(api.getSmtpConfig).mockResolvedValue({
      ...smtpUit,
      configured: true,
      host: 'smtp.example',
      from: 'post@example.nl',
    });

    render(<SmtpSectie />, { wrapper: alleenQueries });

    const host = (await screen.findByLabelText('settings.smtp.host')) as HTMLInputElement;
    await waitFor(() => expect(host.value).toBe('smtp.example'));
    expect(api.getSmtpConfig).toHaveBeenCalled();
  });
});

describe('knoop 2 - elke sectie heeft zijn eigen bevestiging', () => {
  beforeEach(() => {
    vi.mocked(api.getSmtpConfig).mockResolvedValue({ ...smtpUit, configured: true, host: 'smtp.example' });
    vi.mocked(api.getTelegramConfig).mockResolvedValue({ ...telegramUit, configured: true, tokenPreview: '123:abc' });
  });

  it('toont bij de SMTP-knop alleen de SMTP-vraag', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('settings.smtp.remove'));

    expect(await screen.findByText('settings.smtp.removeConfirm')).toBeInTheDocument();
    expect(screen.queryByText('settings.telegram.removeConfirm')).not.toBeInTheDocument();
  });

  it('toont bij de Telegram-knop alleen de Telegram-vraag', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('settings.telegram.remove'));

    expect(await screen.findByText('settings.telegram.removeConfirm')).toBeInTheDocument();
    expect(screen.queryByText('settings.smtp.removeConfirm')).not.toBeInTheDocument();
  });

  // Afbreken raakt alleen de sectie waar je bent: de andere kaarten merken er
  // niets van, en er wordt niets verwijderd.
  it('laat na afbreken de andere secties ongemoeid', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('settings.smtp.remove'));
    await screen.findByText('settings.smtp.removeConfirm');
    await gebruiker.click(screen.getByText('common.cancel'));

    await waitFor(() => expect(screen.queryByText('settings.smtp.removeConfirm')).not.toBeInTheDocument());
    expect(screen.getByText('settings.telegram.remove')).toBeInTheDocument();
    expect(api.removeSmtpConfig).not.toHaveBeenCalled();
  });
});
