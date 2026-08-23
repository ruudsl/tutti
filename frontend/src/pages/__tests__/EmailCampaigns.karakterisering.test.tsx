/**
 * Eerste vangnet onder de campagnepagina.
 *
 * EmailCampaigns.tsx was nooit getest: 165 statements, nul gedekt. Wat deze
 * pagina doet is onomkeerbaar - een verstuurde mailing haal je niet terug uit
 * de brievenbus van tweehonderd leden. Juist daar hoort een vangnet.
 *
 * De aanleiding is een fout die aan de serverkant gevonden werd: een campagne
 * met een lege ontvangerslijst ging naar élk actief lid, terwijl het
 * voorbeeldscherm keurig nul ontvangers toonde. Die twee kanten rekenden anders.
 * Aan de serverkant is dat gerepareerd; hier is de vraag wat dit scherm laat
 * zien vóórdat er op verzenden gedrukt wordt, en dat bleek te weinig.
 *
 * De meeste tests hieronder zijn karakterisering: ze leggen vast wat de pagina
 * doet, ook waar dat niet ideaal is. De tests bij 'herstelde fouten' zijn
 * regressietests en dragen een BEWIJS-regel met de manier waarop is nagegaan
 * dat ze zonder de reparatie rood zijn.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import EmailCampaigns from '../EmailCampaigns';
import { ConfirmProvider } from '../../hooks/useConfirm';
import { showError } from '../../utils/toast';
import * as campagneApi from '../../api/email-campaigns';
import type {
  CampaignAttachment,
  CampaignRecipient,
  EmailCampaign,
  EmailCampaignDetail,
  EmailTemplate,
} from '../../api/email-campaigns';

vi.mock('../../api/email-campaigns');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function maakCampagne(overschrijving: Partial<EmailCampaign> = {}): EmailCampaign {
  return {
    id: 'camp-1',
    name: 'Zomerconcert',
    subject: 'Kom je ook naar het zomerconcert?',
    status: 'draft',
    targetType: 'all',
    totalRecipients: 0,
    deliveredCount: 0,
    openedCount: 0,
    clickedCount: 0,
    bouncedCount: 0,
    createdBy: 'u-1',
    createdByName: 'Ada de Vries',
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overschrijving,
  };
}

function maakDetail(overschrijving: Partial<EmailCampaignDetail> = {}): EmailCampaignDetail {
  return {
    ...maakCampagne(),
    bodyHtml: '<p>Beste leden</p>',
    updatedAt: '2026-06-01T10:00:00.000Z',
    recipientStats: {},
    ...overschrijving,
  };
}

const CAMPAGNES: EmailCampaign[] = [
  maakCampagne(),
  maakCampagne({
    id: 'camp-2',
    name: 'Ledenvergadering',
    subject: 'Uitnodiging vergadering',
    status: 'sent',
    totalRecipients: 40,
    deliveredCount: 38,
    openedCount: 21,
    bouncedCount: 2,
    sentAt: '2026-05-01T10:00:00.000Z',
  }),
];

const SJABLONEN: EmailTemplate[] = [
  {
    id: 'sjab-1',
    name: 'Standaardbrief',
    subject: 'Onderwerp uit sjabloon',
    bodyHtml: '<p>Inhoud uit sjabloon</p>',
    bodyText: 'Inhoud uit sjabloon',
    isSystem: false,
    createdBy: 'u-1',
    createdByName: 'Ada de Vries',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

const BIJLAGEN: CampaignAttachment[] = [
  {
    id: 'bijl-1',
    filename: 'opgeslagen.pdf',
    originalFilename: 'programma.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    uploadedBy: 'u-1',
    uploadedAt: '2026-06-01T10:00:00.000Z',
  },
];

const ONTVANGERS: CampaignRecipient[] = [
  { id: 'ont-1', email: 'jan@example.com', name: 'Jan Jansen', status: 'opened', openedAt: '2026-05-02T09:00:00.000Z' },
  { id: 'ont-2', email: 'ada@example.com', name: 'Ada de Vries', status: 'bounced', bounceReason: 'mailbox vol' },
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(campagneApi)) {
    const functie = (campagneApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(campagneApi.getEmailCampaigns).mockResolvedValue(CAMPAGNES);
  vi.mocked(campagneApi.getEmailTemplates).mockResolvedValue(SJABLONEN);
  vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(maakDetail());
  vi.mocked(campagneApi.getCampaignAttachments).mockResolvedValue([]);
  vi.mocked(campagneApi.previewRecipients).mockResolvedValue({
    count: 2,
    recipients: [
      { id: 'u-1', email: 'jan@example.com', name: 'Jan Jansen' },
      { id: 'u-2', email: 'ada@example.com', name: 'Ada de Vries' },
    ],
  });
  vi.mocked(campagneApi.getCampaignRecipients).mockResolvedValue({
    recipients: ONTVANGERS,
    total: 2,
    byStatus: { pending: 0, sent: 0, delivered: 0, opened: 1, clicked: 0, bounced: 1, failed: 0 },
  });
  vi.mocked(campagneApi.sendCampaign).mockResolvedValue({ message: 'ok' });
  vi.mocked(campagneApi.scheduleCampaign).mockResolvedValue({ message: 'ok' });
  vi.mocked(campagneApi.cancelCampaign).mockResolvedValue({ message: 'ok' });
  vi.mocked(campagneApi.deleteEmailCampaign).mockResolvedValue({ message: 'ok' });
  vi.mocked(campagneApi.sendTestEmail).mockResolvedValue({ message: 'ok' });
  vi.mocked(campagneApi.createEmailCampaign).mockResolvedValue({ id: 'camp-nieuw', message: 'ok' });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  // De echte bevestigingsdialoog, niet een nagemaakte: of er bevestigd wordt
  // vóór het versturen is hier juist het onderwerp.
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
}

/** Rendert de pagina en wacht tot de lijst met campagnes er staat. */
async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<EmailCampaigns />, { wrapper: wikkel });
  await screen.findByText('Zomerconcert');
  return gebruiker;
}

/** Opent het detailvenster van een campagne door op de kaart te klikken. */
async function openCampagne(gebruiker: ReturnType<typeof userEvent.setup>, naam: string) {
  await gebruiker.click(screen.getByText(naam));
  return await screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('campagnepagina - de lijst', () => {
  it('toont het skelet zolang de campagnes nog laden', async () => {
    let losmaken: (campagnes: EmailCampaign[]) => void = () => {};
    vi.mocked(campagneApi.getEmailCampaigns).mockReturnValue(
      new Promise<EmailCampaign[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<EmailCampaigns />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(CAMPAGNES);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('toont de campagnes die de server stuurt', async () => {
    await toonPagina();

    expect(screen.getByText('Zomerconcert')).toBeInTheDocument();
    expect(screen.getByText('Kom je ook naar het zomerconcert?')).toBeInTheDocument();
    // Dezelfde teksten staan ook in het statusfilter, vandaar de merkjes op de
    // kaarten zelf: die staan in een `span.badge`.
    const merkjes = screen.getAllByText(/^emailCampaigns.status./).filter((el) => el.tagName === 'SPAN');
    expect(merkjes.map((el) => el.textContent)).toEqual(['emailCampaigns.status.draft', 'emailCampaigns.status.sent']);
    // Alleen bij een verzonden campagne staan de aantallen op de kaart.
    expect(screen.getByText(/38/)).toBeInTheDocument();
    expect(screen.getByText(/21/)).toBeInTheDocument();
  });

  it('toont de lege staat als er geen campagnes zijn', async () => {
    vi.mocked(campagneApi.getEmailCampaigns).mockResolvedValue([]);

    render(<EmailCampaigns />, { wrapper: wikkel });

    expect(await screen.findByText('emailCampaigns.noCampaigns')).toBeInTheDocument();
  });

  it('zoekt in naam en onderwerp zonder de server opnieuw te bevragen', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('emailCampaigns.searchPlaceholder'), 'vergader');

    // Het zoeken gebeurt in de browser op de al opgehaalde lijst: het onderwerp
    // van de tweede campagne bevat 'vergader', de eerste valt weg.
    await waitFor(() => expect(screen.queryByText('Zomerconcert')).not.toBeInTheDocument());
    expect(screen.getByText('Ledenvergadering')).toBeInTheDocument();
    expect(vi.mocked(campagneApi.getEmailCampaigns).mock.calls).toHaveLength(1);
  });

  it('meldt het als het zoeken niets oplevert', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('emailCampaigns.searchPlaceholder'), 'bestaatniet');

    expect(await screen.findByText('emailCampaigns.noCampaigns')).toBeInTheDocument();
  });

  it('laat de server filteren op status', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'draft');

    await waitFor(() => expect(campagneApi.getEmailCampaigns).toHaveBeenLastCalledWith('draft'));
  });

  it('haalt bij het openen geen campagnedetail op', async () => {
    await toonPagina();

    expect(campagneApi.getEmailCampaign).not.toHaveBeenCalled();
  });
});

describe('campagnepagina - het detailvenster van een concept', () => {
  it('haalt het detail op en toont onderwerp en inhoud', async () => {
    const gebruiker = await toonPagina();

    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(campagneApi.getEmailCampaign).toHaveBeenCalledWith('camp-1'));
    expect(within(venster).getByText('Kom je ook naar het zomerconcert?')).toBeInTheDocument();
    expect(within(venster).getByText('Beste leden')).toBeInTheDocument();
  });

  it('toont wie de ontvangers zijn voordat er iets verstuurd wordt', async () => {
    const gebruiker = await toonPagina();

    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(campagneApi.previewRecipients).toHaveBeenCalledWith('camp-1'));
    expect(await within(venster).findByText('Jan Jansen')).toBeInTheDocument();
    expect(within(venster).getByText('Ada de Vries')).toBeInTheDocument();
    expect(within(venster).getByText('emailCampaigns.recipientsPreview')).toBeInTheDocument();
  });

  it('toont bij meer dan twintig ontvangers hoeveel er niet in beeld staan', async () => {
    vi.mocked(campagneApi.previewRecipients).mockResolvedValue({
      count: 25,
      recipients: Array.from({ length: 25 }, (_, i) => ({
        id: `u-${i}`,
        email: `lid${i}@example.com`,
        name: `Lid ${i}`,
      })),
    });

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(await within(venster).findByText(/\+5/)).toBeInTheDocument();
    expect(within(venster).queryByText('Lid 24')).not.toBeInTheDocument();
  });

  it('meldt dat er nog geen bijlagen zijn', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(await within(venster).findByText('emailCampaigns.noAttachments')).toBeInTheDocument();
  });

  it('toont bijlagen met hun bestandsgrootte', async () => {
    vi.mocked(campagneApi.getCampaignAttachments).mockResolvedValue(BIJLAGEN);

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(await within(venster).findByText('programma.pdf')).toBeInTheDocument();
    // 2048 bytes hoort als kilobytes op het scherm te komen, niet als bytes.
    expect(within(venster).getByText('(2.0 KB)')).toBeInTheDocument();
  });

  it('verstuurt een test-e-mail naar het opgegeven adres', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendTestEmail/ }));
    await gebruiker.type(within(venster).getByPlaceholderText('emailCampaigns.testEmailPlaceholder'), 'ik@example.com');
    await gebruiker.click(within(venster).getByRole('button', { name: 'emailCampaigns.sendTest' }));

    await waitFor(() => expect(campagneApi.sendTestEmail).toHaveBeenCalledWith('camp-1', 'ik@example.com'));
  });

  it('houdt de testknop op slot zolang er geen adres staat', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendTestEmail/ }));

    expect(within(venster).getByRole('button', { name: 'emailCampaigns.sendTest' })).toBeDisabled();
  });

  it('vraagt om bevestiging voordat een campagne verdwijnt', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await gebruiker.click(within(venster).getByRole('button', { name: /common.delete/ }));

    const vraag = await screen.findByRole('alertdialog');
    expect(vraag).toHaveTextContent('emailCampaigns.confirmDelete');
    expect(campagneApi.deleteEmailCampaign).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.confirm' }));
    // react-query geeft elke mutatiefunctie zijn eigen context mee.
    await waitFor(() => expect(campagneApi.deleteEmailCampaign).toHaveBeenCalledWith('camp-1', expect.anything()));
  });

  it('plant een campagne in', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(within(venster).getByRole('button', { name: /emailCampaigns.schedule/ })).toBeEnabled());
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.schedule/ }));

    await waitFor(() => expect(campagneApi.scheduleCampaign).toHaveBeenCalledWith('camp-1'));
  });
});

describe('campagnepagina - een verzonden campagne', () => {
  it('haalt geen ontvangersvoorbeeld op voor een campagne die al weg is', async () => {
    vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(
      maakDetail({ id: 'camp-2', name: 'Ledenvergadering', status: 'sent', totalRecipients: 40 }),
    );

    const gebruiker = await toonPagina();
    await openCampagne(gebruiker, 'Ledenvergadering');

    await waitFor(() => expect(campagneApi.getEmailCampaign).toHaveBeenCalled());
    // Het voorbeeld gaat over wie er nog post krijgt; bij een verzonden
    // campagne is dat niet meer aan de orde.
    expect(campagneApi.previewRecipients).not.toHaveBeenCalled();
  });

  it('toont de aantallen en de lijst met ontvangers', async () => {
    vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(
      maakDetail({
        id: 'camp-2',
        name: 'Ledenvergadering',
        status: 'sent',
        totalRecipients: 40,
        deliveredCount: 38,
        openedCount: 21,
        bouncedCount: 2,
      }),
    );

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Ledenvergadering');

    expect(within(venster).getByText('40')).toBeInTheDocument();
    expect(within(venster).getByText('38')).toBeInTheDocument();

    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.viewRecipients/ }));

    const vensters = await screen.findAllByRole('dialog');
    const ontvangers = vensters[vensters.length - 1];
    expect(await within(ontvangers).findByText('Jan Jansen')).toBeInTheDocument();
    expect(within(ontvangers).getByText('ada@example.com')).toBeInTheDocument();
    // De reden van een weigering hoort erbij, anders is een bounce niet op te
    // lossen.
    expect(within(ontvangers).getByText('mailbox vol')).toBeInTheDocument();
  });

  it('filtert de ontvangers op afleverstatus', async () => {
    vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(
      maakDetail({ id: 'camp-2', name: 'Ledenvergadering', status: 'sent', totalRecipients: 40 }),
    );

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Ledenvergadering');
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.viewRecipients/ }));

    const vensters = await screen.findAllByRole('dialog');
    const ontvangers = within(vensters[vensters.length - 1]);
    await ontvangers.findByText('Jan Jansen');

    await gebruiker.click(ontvangers.getByRole('button', { name: /emailCampaigns.recipientStatus.bounced/ }));

    await waitFor(() => expect(ontvangers.queryByText('Jan Jansen')).not.toBeInTheDocument());
    expect(ontvangers.getByText('Ada de Vries')).toBeInTheDocument();
  });

  it('meldt het als er geen ontvangers te tonen zijn', async () => {
    vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(
      maakDetail({ id: 'camp-2', name: 'Ledenvergadering', status: 'sent', totalRecipients: 0 }),
    );
    vi.mocked(campagneApi.getCampaignRecipients).mockResolvedValue({
      recipients: [],
      total: 0,
      byStatus: { pending: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 },
    });

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Ledenvergadering');
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.viewRecipients/ }));

    expect(await screen.findByText('emailCampaigns.noRecipientsFound')).toBeInTheDocument();
  });
});

describe('campagnepagina - een nieuwe campagne opstellen', () => {
  it('houdt de aanmaakknop op slot zolang naam, onderwerp of inhoud ontbreekt', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /emailCampaigns.createCampaign/ }));

    const venster = await screen.findByRole('dialog');
    const knop = within(venster).getByRole('button', { name: /emailCampaigns.createCampaign/ });
    expect(knop).toBeDisabled();

    await gebruiker.type(within(venster).getByPlaceholderText('emailCampaigns.namePlaceholder'), 'Najaarsconcert');
    expect(knop).toBeDisabled();
  });

  it('stuurt de ingevulde campagne naar de server', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /emailCampaigns.createCampaign/ }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.type(within(venster).getByPlaceholderText('emailCampaigns.namePlaceholder'), 'Najaarsconcert');
    await gebruiker.type(within(venster).getByPlaceholderText('emailCampaigns.subjectPlaceholder'), 'Kom kijken');
    await gebruiker.type(within(venster).getByPlaceholderText('emailCampaigns.contentPlaceholder'), '<p>Hallo</p>');
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.createCampaign/ }));

    await waitFor(() =>
      expect(campagneApi.createEmailCampaign).toHaveBeenCalledWith(
        {
          name: 'Najaarsconcert',
          subject: 'Kom kijken',
          bodyHtml: '<p>Hallo</p>',
          targetType: 'all',
        },
        expect.anything(),
      ),
    );
  });

  it('neemt onderwerp en inhoud over uit een gekozen sjabloon', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /emailCampaigns.createCampaign/ }));
    const venster = await screen.findByRole('dialog');

    // De sjabloonkeuze staat boven de doelgroepkeuze.
    await gebruiker.selectOptions(within(venster).getAllByRole('combobox')[0], 'sjab-1');

    expect(within(venster).getByPlaceholderText('emailCampaigns.subjectPlaceholder')).toHaveValue(
      'Onderwerp uit sjabloon',
    );
    expect(within(venster).getByPlaceholderText('emailCampaigns.contentPlaceholder')).toHaveValue(
      '<p>Inhoud uit sjabloon</p>',
    );
  });
});

describe('campagnepagina - een ingeplande campagne', () => {
  beforeEach(() => {
    vi.mocked(campagneApi.getEmailCampaign).mockResolvedValue(
      maakDetail({ status: 'scheduled', scheduledAt: '2026-07-01T10:00:00.000Z' }),
    );
  });

  it('biedt annuleren aan en voert dat uit', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    // Een ingeplande campagne is nog tegen te houden; verwijderen kan niet meer.
    expect(within(venster).queryByRole('button', { name: /common.delete/ })).not.toBeInTheDocument();

    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.cancel/ }));

    await waitFor(() => expect(campagneApi.cancelCampaign).toHaveBeenCalledWith('camp-1'));
  });

  it('haalt geen ontvangersvoorbeeld op, en vraagt toch om bevestiging bij versturen', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(campagneApi.previewRecipients).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ }));
    const vraag = await screen.findByRole('alertdialog');
    expect(vraag).toHaveTextContent('emailCampaigns.confirmSend');
  });
});

describe('campagnepagina - als er iets misgaat', () => {
  it('toont de melding van de server als het versturen mislukt', async () => {
    vi.mocked(campagneApi.sendCampaign).mockRejectedValue({
      response: { data: { error: 'De mailserver weigert de verbinding' } },
    });

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ })).toBeEnabled());
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ }));
    const vraag = await screen.findByRole('alertdialog');
    await gebruiker.click(within(vraag).getByRole('button', { name: 'emailCampaigns.sendNow' }));

    // Een mislukte verzending mag niet als geslaagd overkomen: wie denkt dat de
    // mailing weg is, verstuurt hem niet opnieuw.
    await waitFor(() => expect(showError).toHaveBeenCalledWith('De mailserver weigert de verbinding'));
  });

  it('verwijdert een bijlage pas na bevestiging', async () => {
    vi.mocked(campagneApi.getCampaignAttachments).mockResolvedValue(BIJLAGEN);

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');
    await within(venster).findByText('programma.pdf');

    await gebruiker.click(within(venster).getAllByTestId('icon-trash')[0]);

    const vraag = await screen.findByRole('alertdialog');
    expect(vraag).toHaveTextContent('emailCampaigns.confirmDeleteAttachment');
    expect(campagneApi.deleteCampaignAttachment).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(campagneApi.deleteCampaignAttachment).toHaveBeenCalledWith('camp-1', 'bijl-1'));
  });
});

/**
 * Regressietests bij herstelde fouten. Deze leggen niet vast wat de pagina deed
 * maar wat hij moet doen.
 */
describe('campagnepagina - herstelde fouten', () => {
  /**
   * BEWIJS: met `git checkout HEAD -- src/pages/EmailCampaigns.tsx` is deze
   * test rood. Op die versie stond het ontvangersvak achter
   * `recipientsPreview && ...`: mislukte het ophalen, dan stond er over de
   * ontvangers niets op het scherm en was 'nu versturen' gewoon indrukbaar.
   */
  it('zet verzenden op slot zolang niet vaststaat naar wie de mailing gaat', async () => {
    vi.mocked(campagneApi.previewRecipients).mockRejectedValue(new Error('geen verbinding'));

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(await within(venster).findByText('emailCampaigns.recipientsUnknown')).toBeInTheDocument();
    expect(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ })).toBeDisabled();
    // Ook inplannen kan niet: dat verstuurt hem straks alsnog.
    expect(within(venster).getByRole('button', { name: /emailCampaigns.schedule/ })).toBeDisabled();
  });

  /**
   * BEWIJS: op de versie zonder de reparatie is deze test rood. Daar stond bij
   * nul ontvangers een leeg vak zonder uitleg, en was de verzendknop
   * indrukbaar - precies de knop die aan de serverkant de mailing naar élk
   * actief lid stuurde.
   */
  it('zet verzenden op slot bij een campagne zonder ontvangers', async () => {
    vi.mocked(campagneApi.previewRecipients).mockResolvedValue({ count: 0, recipients: [] });

    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    expect(await within(venster).findByText('emailCampaigns.recipientsNone')).toBeInTheDocument();
    expect(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ })).toBeDisabled();
  });

  /**
   * BEWIJS: op de versie zonder de reparatie is deze test rood. Daar ging bij
   * de eerste klik meteen `sendCampaign` de deur uit, zonder tussenstap.
   * Verwijderen vroeg wél om bevestiging - terwijl een verwijderde campagne
   * opnieuw te maken is en een verstuurde mailing niet.
   */
  it('vraagt om bevestiging voordat de mailing echt de deur uit gaat', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ })).toBeEnabled());
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ }));

    const vraag = await screen.findByRole('alertdialog');
    expect(vraag).toHaveTextContent('emailCampaigns.confirmSend');
    expect(campagneApi.sendCampaign).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(campagneApi.sendCampaign).not.toHaveBeenCalled();
  });

  it('verstuurt de mailing na bevestiging', async () => {
    const gebruiker = await toonPagina();
    const venster = await openCampagne(gebruiker, 'Zomerconcert');

    await waitFor(() => expect(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ })).toBeEnabled());
    await gebruiker.click(within(venster).getByRole('button', { name: /emailCampaigns.sendNow/ }));

    const vraag = await screen.findByRole('alertdialog');
    await gebruiker.click(within(vraag).getByRole('button', { name: 'emailCampaigns.sendNow' }));

    await waitFor(() => expect(campagneApi.sendCampaign).toHaveBeenCalledWith('camp-1'));
  });

  /**
   * BEWIJS: op de versie zonder de reparatie is deze test rood. Daar toonde een
   * mislukte aanvraag 'emailCampaigns.noCampaigns', dezelfde tekst als bij een
   * geslaagde aanvraag zonder resultaat.
   */
  it('zegt het als het ophalen mislukt in plaats van te doen alsof er niets is', async () => {
    vi.mocked(campagneApi.getEmailCampaigns).mockRejectedValue(new Error('geen verbinding'));

    render(<EmailCampaigns />, { wrapper: wikkel });

    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('emailCampaigns.noCampaigns')).not.toBeInTheDocument();

    // De pagina blijft verder gewoon staan.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('emailCampaigns.title');
    expect(screen.getByPlaceholderText('emailCampaigns.searchPlaceholder')).toBeInTheDocument();
  });

  it('probeert het opnieuw op verzoek van de gebruiker', async () => {
    vi.mocked(campagneApi.getEmailCampaigns).mockRejectedValue(new Error('geen verbinding'));

    const gebruiker = userEvent.setup();
    render(<EmailCampaigns />, { wrapper: wikkel });
    await screen.findByText('errors.generic');

    vi.mocked(campagneApi.getEmailCampaigns).mockResolvedValue(CAMPAGNES);
    await gebruiker.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Zomerconcert')).toBeInTheDocument();
  });
});
