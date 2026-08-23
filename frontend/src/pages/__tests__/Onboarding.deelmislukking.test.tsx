/**
 * Het aanmelden van een nieuw lid, en vooral: wat er op het scherm staat als
 * het maar half gelukt is.
 *
 * Een aanmelding raakt vier systemen - de eigen ledenlijst, Microsoft 365, de
 * licentie daarbij en het doorsturen van e-mail - en de server meldt per stap
 * of het gelukt is. De pagina moet die deelmislukkingen eerlijk laten zien:
 * niet alles groen als de M365-kant faalde, en geen herstelknop aanbieden voor
 * iets wat helemaal niet gevraagd was.
 *
 * De labels van het formulier staan in Onboarding.labels.test.tsx hiernaast;
 * hier gaat het om wat er ná het versturen gebeurt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Onboarding from '../Onboarding';
import type { OnboardingResponse } from '../../api/onboarding';

// Het wachten van testing-library staat standaard op één seconde. Dat is krap
// zodra de dekkingsmeting meedraait: elke render gaat dan door de instrumentatie
// heen, en op een bezette machine tikt een `waitFor` na een knopdruk daar
// overheen. Dat zou een trage machine als een fout laten lezen.
configure({ asyncUtilTimeout: 4000 });

// De tijdslimiet per test staat standaard op vijf seconden. Een test die een
// heel formulier invult en verstuurt haalt dat ruim, maar niet als de
// dekkingsmeting meedraait én de machine gedeeld wordt: dan wordt dezelfde test
// een veelvoud trager en valt hij om op de klok in plaats van op de code.
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties.name === 'string' ? `${sleutel}:${opties.name}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { toonSucces, toonFout } = vi.hoisted(() => ({ toonSucces: vi.fn(), toonFout: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: toonSucces, showError: toonFout }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const api = vi.hoisted(() => ({
  onboardMember: vi.fn(),
  getPendingSpondLinks: vi.fn(),
  deletePendingSpondLink: vi.fn(),
  getInactiveMembers: vi.fn(),
  reactivateMember: vi.fn(),
  getMicrosoftConfig: vi.fn(),
  getM365GroupMappings: vi.fn(),
  getInstrumentJobTitleMappings: vi.fn(),
  createInstrumentJobTitleMapping: vi.fn(),
  updateInstrumentJobTitleMapping: vi.fn(),
  deleteInstrumentJobTitleMapping: vi.fn(),
  retryEmailForwarding: vi.fn(),
}));
vi.mock('../../api', () => api);

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }] }),
}));

function uitkomst(overschrijving: Partial<OnboardingResponse> = {}): OnboardingResponse {
  return {
    success: true,
    userId: 'geb-1',
    email: 'nieuw@harmonie.nl',
    firstName: 'Nieuw',
    lastName: 'Lid',
    tempPassword: 'Tijdelijk-123',
    m365Created: true,
    m365Error: null,
    licenseAssigned: true,
    groupsAdded: ['Harmonie'],
    groupsFailed: [],
    emailForwardingSet: false,
    spondLinkPending: true,
    message: 'Lid aangemaakt',
    instructions: ['Geef het wachtwoord door', 'Laat het lid inloggen'],
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Tekent de pagina en wacht tot de Microsoft-instellingen binnen zijn. */
async function toon(opties: Parameters<typeof userEvent.setup>[0] = {}) {
  // `delay: null` tikt de toetsaanslagen zonder tussenpauze in. Met de
  // standaardinstelling zet userEvent per teken een taak in de wachtrij, en het
  // aanmeldformulier van drie velden liep daarmee op een bezette machine tegen
  // de tijdslimiet van vitest aan.
  const bediener = userEvent.setup({ delay: null, ...opties });
  const hulp = render(<Onboarding />, { wrapper: wikkel });
  await screen.findByLabelText('memberOnboarding.privateEmail');
  return { bediener, ...hulp };
}

/**
 * Vult het aanmeldformulier in en verstuurt het.
 *
 * `priveEmail` is met opzet apart: of dat veld ingevuld is bepaalt of er
 * überhaupt iets door te sturen valt.
 */
async function meldAan(bediener: ReturnType<typeof userEvent.setup>, priveEmail?: string) {
  await bediener.type(screen.getByLabelText(/memberOnboarding.firstName/), 'Nieuw');
  await bediener.type(screen.getByLabelText(/memberOnboarding.lastName/), 'Lid');
  await bediener.type(screen.getByLabelText(/memberOnboarding.email/), 'nieuw@harmonie.nl');
  if (priveEmail) {
    await bediener.type(screen.getByLabelText('memberOnboarding.privateEmail'), priveEmail);
  }
  await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.createMember' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMicrosoftConfig.mockResolvedValue({ configured: true });
  api.getM365GroupMappings.mockResolvedValue([]);
  api.getInstrumentJobTitleMappings.mockResolvedValue([]);
  api.getPendingSpondLinks.mockResolvedValue([]);
  api.getInactiveMembers.mockResolvedValue([]);
  api.onboardMember.mockResolvedValue(uitkomst());
  api.retryEmailForwarding.mockResolvedValue({ success: true, message: 'Doorsturen staat aan' });
  api.deletePendingSpondLink.mockResolvedValue({ message: 'weg' });
  api.reactivateMember.mockResolvedValue({ message: 'terug' });
});

describe('lid aanmelden - de uitkomst van een geslaagde aanmelding', () => {
  it('stuurt het ingevulde formulier op en toont daarna het tijdelijke wachtwoord', async () => {
    const { bediener } = await toon();

    await bediener.selectOptions(screen.getByLabelText('memberOnboarding.instruments'), 'inst-1');
    await bediener.click(screen.getByRole('checkbox', { name: 'Harmonie' }));
    await meldAan(bediener, 'thuis@voorbeeld.nl');

    await waitFor(() =>
      expect(api.onboardMember).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Nieuw',
          lastName: 'Lid',
          email: 'nieuw@harmonie.nl',
          privateEmail: 'thuis@voorbeeld.nl',
          instrumentIds: ['inst-1'],
          orchestraIds: ['ork-1'],
        }),
        // react-query geeft de opdrachtfunctie een tweede meegave mee.
        expect.anything(),
      ),
    );

    expect(await screen.findByText('memberOnboarding.successTitle')).toBeInTheDocument();
    expect(screen.getByText('Lid aangemaakt')).toBeInTheDocument();
    expect(screen.getByText('Tijdelijk-123')).toBeInTheDocument();
    // De instructies van de server komen op volgorde te staan.
    expect(screen.getByText('Geef het wachtwoord door')).toBeInTheDocument();
    expect(screen.getByText('Laat het lid inloggen')).toBeInTheDocument();
    // Het formulier is weg: er valt niets meer per ongeluk twee keer te sturen.
    expect(screen.queryByRole('button', { name: 'memberOnboarding.createMember' })).not.toBeInTheDocument();
  });

  it('zet het tijdelijke wachtwoord op het klembord en zegt dat het gelukt is', async () => {
    const { bediener } = await toon();
    await meldAan(bediener);
    await screen.findByText('Tijdelijk-123');

    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.copy' }));

    expect(await navigator.clipboard.readText()).toBe('Tijdelijk-123');
    expect(toonSucces).toHaveBeenCalledWith('memberOnboarding.passwordCopied');
    // De knop zegt nu dat het gebeurd is.
    expect(screen.getByRole('button', { name: 'memberOnboarding.copied' })).toBeInTheDocument();
  });

  it('begint met een schoon formulier bij het volgende lid', async () => {
    const { bediener } = await toon();
    await meldAan(bediener, 'thuis@voorbeeld.nl');
    await screen.findByText('memberOnboarding.successTitle');

    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.addAnother' }));

    expect(screen.getByLabelText(/memberOnboarding.firstName/)).toHaveValue('');
    expect(screen.getByLabelText('memberOnboarding.privateEmail')).toHaveValue('');
    expect(screen.queryByText('Tijdelijk-123')).not.toBeInTheDocument();
  });

  it('meldt het als de server de aanmelding weigert', async () => {
    api.onboardMember.mockRejectedValue({ response: { data: { error: 'E-mailadres bestaat al' } } });
    const { bediener } = await toon();

    await meldAan(bediener);

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('E-mailadres bestaat al'));
    // Het formulier blijft staan mét de ingevulde gegevens, zodat er niets
    // opnieuw ingetikt hoeft te worden.
    expect(screen.getByLabelText(/memberOnboarding.firstName/)).toHaveValue('Nieuw');
  });
});

describe('lid aanmelden - deelmislukkingen', () => {
  it('zet de fout van Microsoft 365 in de statuslijst en niet als succes', async () => {
    api.onboardMember.mockResolvedValue(
      uitkomst({
        m365Created: false,
        m365Error: 'Geen licenties meer beschikbaar',
        licenseAssigned: false,
      }),
    );
    const { bediener } = await toon();
    await meldAan(bediener, 'thuis@voorbeeld.nl');

    // Het lid bestaat wél in de eigen ledenlijst; alleen de M365-kant faalde.
    expect(await screen.findByText('memberOnboarding.harmonieCreated')).toBeInTheDocument();
    expect(screen.getByText(/Geen licenties meer beschikbaar/)).toBeInTheDocument();
    expect(screen.queryByText('memberOnboarding.m365Created')).not.toBeInTheDocument();
    // Zonder M365-account valt er niets door te sturen, dus ook geen herstelknop.
    expect(screen.queryByText('memberOnboarding.emailForwardingPending')).not.toBeInTheDocument();
  });

  it('laat de aanmelding zien als de aanvraag helemaal mislukte', async () => {
    api.onboardMember.mockResolvedValue(
      uitkomst({ success: false, message: 'Aanmelding teruggedraaid', m365Created: false, m365Error: 'Graph gaf 500' }),
    );
    const { bediener } = await toon();
    await meldAan(bediener);

    expect(await screen.findByText('memberOnboarding.errorTitle')).toBeInTheDocument();
    expect(screen.getByText('Aanmelding teruggedraaid')).toBeInTheDocument();
    // Geen wachtwoord en geen statuslijst: er is niets aangemaakt om te tonen.
    expect(screen.queryByText('memberOnboarding.tempPasswordTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('memberOnboarding.statusTitle')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'memberOnboarding.addAnother' })).toBeInTheDocument();
  });

  it('biedt aan het doorsturen opnieuw in te stellen als de postbus nog niet klaar was', async () => {
    const { bediener } = await toon();
    await meldAan(bediener, 'thuis@voorbeeld.nl');

    expect(await screen.findByText('memberOnboarding.emailForwardingPending')).toBeInTheDocument();
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.retryEmailForwarding' }));

    await waitFor(() => expect(api.retryEmailForwarding).toHaveBeenCalledWith('geb-1', expect.anything()));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('Doorsturen staat aan'));
    // Gelukt: de waarschuwing verdwijnt van het scherm.
    await waitFor(() => expect(screen.queryByText('memberOnboarding.emailForwardingPending')).not.toBeInTheDocument());
  });

  it('laat de waarschuwing staan als het opnieuw instellen weer mislukt', async () => {
    api.retryEmailForwarding.mockRejectedValue({ response: { data: { error: 'Postbus nog niet klaar' } } });
    const { bediener } = await toon();
    await meldAan(bediener, 'thuis@voorbeeld.nl');

    await bediener.click(await screen.findByRole('button', { name: 'memberOnboarding.retryEmailForwarding' }));

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('Postbus nog niet klaar'));
    expect(screen.getByText('memberOnboarding.emailForwardingPending')).toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie in Onboarding.tsx (de voorwaarde eist nu ook
   * dat er een privé-adres is ingevuld) staat hier na élke aanmelding mét
   * M365-account de waarschuwing "e-mail doorsturen nog niet ingesteld", ook
   * als er niets om door te sturen was.
   *
   * De server stelt doorsturen alleen in als er een privé-adres is, en meldt
   * anders `emailForwardingSet: false` - hetzelfde antwoord als bij een mislukte
   * poging. De pagina las dat als "mislukt" en bood een herstelknop aan die
   * niet kán slagen: het herstelpunt weigert met "Gebruiker heeft geen privé
   * emailadres geconfigureerd". Een beheerder ziet dus een rode vlag bij een
   * aanmelding die vlekkeloos ging, en kan er niets aan doen.
   *
   * Rood zonder de reparatie op de eerste `expect`: de waarschuwing staat er.
   */
  it('waarschuwt niet over doorsturen als er geen privé-adres is ingevuld', async () => {
    const { bediener } = await toon();
    await meldAan(bediener);

    await screen.findByText('memberOnboarding.successTitle');
    expect(api.onboardMember).toHaveBeenCalledWith(
      expect.objectContaining({ privateEmail: undefined }),
      expect.anything(),
    );

    expect(screen.queryByText('memberOnboarding.emailForwardingPending')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'memberOnboarding.retryEmailForwarding' })).not.toBeInTheDocument();

    // En na het volgende lid, dat wél een privé-adres heeft, staat hij er weer.
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.addAnother' }));
    await meldAan(bediener, 'thuis@voorbeeld.nl');
    expect(await screen.findByText('memberOnboarding.emailForwardingPending')).toBeInTheDocument();
  });

  it('vraagt niet om herstel zolang de licentie niet is toegekend', async () => {
    // Het account bestaat, maar zonder licentie is er geen postbus - dan valt
    // er ook niets door te sturen.
    api.onboardMember.mockResolvedValue(uitkomst({ licenseAssigned: false }));
    const { bediener } = await toon();
    await meldAan(bediener, 'thuis@voorbeeld.nl');

    expect(await screen.findByText('memberOnboarding.m365Created')).toBeInTheDocument();
    expect(screen.queryByText('memberOnboarding.emailForwardingPending')).not.toBeInTheDocument();
  });
});

describe('lid aanmelden - de profielfoto', () => {
  /** Het bestandsveld staat op display:none en heeft dus geen naam om op te zoeken. */
  function fotoVeld(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="file"]') as HTMLInputElement;
  }

  it('weigert een bestand dat geen jpg of png is', async () => {
    // Zonder `applyAccept: false` houdt userEvent het bestand zelf al tegen op
    // het accept-attribuut, en komt de eigen controle van de pagina - die er
    // voor een echte browser wél toe doet, want daar is accept een suggestie -
    // niet aan bod.
    const { bediener, container } = await toon({ applyAccept: false });

    await bediener.upload(fotoVeld(container), new File(['x'], 'lid.gif', { type: 'image/gif' }));

    expect(toonFout).toHaveBeenCalledWith('memberOnboarding.photoInvalidType');
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
  });

  it('weigert een foto van meer dan vijf megabyte', async () => {
    const { bediener, container } = await toon();
    const grote = new File([new Uint8Array(6 * 1024 * 1024)], 'groot.png', { type: 'image/png' });

    await bediener.upload(fotoVeld(container), grote);

    expect(toonFout).toHaveBeenCalledWith('memberOnboarding.photoTooLarge');
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
  });

  it('toont een voorbeeld van de gekozen foto, stuurt hem mee en laat hem weghalen', async () => {
    const { bediener, container } = await toon();
    const foto = new File(['pixels'], 'lid.png', { type: 'image/png' });

    await bediener.upload(fotoVeld(container), foto);
    expect(await screen.findByAltText('Preview')).toBeInTheDocument();

    await meldAan(bediener);
    await waitFor(() =>
      expect(api.onboardMember).toHaveBeenCalledWith(
        expect.objectContaining({ profilePhoto: foto }),
        expect.anything(),
      ),
    );

    // Terug naar het formulier: de foto is losgelaten.
    await bediener.click(await screen.findByRole('button', { name: 'memberOnboarding.addAnother' }));
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
  });

  it('haalt een gekozen foto weer weg met het kruisje', async () => {
    const { bediener, container } = await toon();

    await bediener.upload(fotoVeld(container), new File(['pixels'], 'lid.jpg', { type: 'image/jpeg' }));
    const voorbeeld = await screen.findByAltText('Preview');

    await bediener.click(within(voorbeeld.parentElement as HTMLElement).getByRole('button'));

    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    expect(fotoVeld(container).value).toBe('');
  });
});

describe('lid aanmelden - de andere tabbladen', () => {
  it('telt de wachtende Spond-koppelingen en laat er een verwijderen', async () => {
    api.getPendingSpondLinks.mockResolvedValue([
      {
        id: 'kop-1',
        userId: 'geb-9',
        expectedEmail: 'anna@harmonie.nl',
        expectedName: 'A. de Vries (Spond)',
        firstName: 'Anna',
        lastName: 'de Vries',
        email: 'anna@harmonie.nl',
        createdAt: '2026-03-01T10:00:00Z',
      },
    ]);
    const { bediener } = await toon();

    const tabblad = await screen.findByRole('button', { name: /memberOnboarding.tabPendingLinks/ });
    expect(within(tabblad).getByText('1')).toBeInTheDocument();

    await bediener.click(tabblad);
    expect(await screen.findByText('A. de Vries (Spond)')).toBeInTheDocument();
    expect(screen.getByText('anna@harmonie.nl')).toBeInTheDocument();
    // De scheidingstekens hangen aan de ingestelde taal; het gaat om de datum.
    expect(screen.getByText(/01.03.2026/)).toBeInTheDocument();

    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.removePending' }));
    await waitFor(() => expect(api.deletePendingSpondLink).toHaveBeenCalledWith('kop-1', expect.anything()));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('memberOnboarding.pendingLinkRemoved'));
  });

  it('zegt het als er niets wacht op een koppeling', async () => {
    const { bediener } = await toon();
    await bediener.click(screen.getByRole('button', { name: /memberOnboarding.tabPendingLinks/ }));

    expect(await screen.findByText('memberOnboarding.noPendingLinks')).toBeInTheDocument();
  });

  it('maakt een uitgeschreven lid pas weer actief na bevestiging', async () => {
    api.getInactiveMembers.mockResolvedValue([
      {
        id: 'geb-8',
        email: 'bram@harmonie.nl',
        firstName: 'Bram',
        lastName: 'Jansen',
        offboardedAt: null,
        createdAt: '2025-01-01T10:00:00Z',
      },
    ]);
    const { bediener } = await toon();

    await bediener.click(await screen.findByRole('button', { name: /memberOnboarding.tabInactive/ }));
    expect(await screen.findByText('Bram Jansen')).toBeInTheDocument();
    // Zonder datum van uitschrijven staat er een streepje in plaats van
    // "Invalid Date".
    expect(screen.getByText('-')).toBeInTheDocument();

    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.reactivate' }));
    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('memberOnboarding.reactivateConfirm:Bram Jansen')).toBeInTheDocument();

    await bediener.click(within(venster).getByRole('button', { name: 'memberOnboarding.reactivate' }));
    await waitFor(() => expect(api.reactivateMember).toHaveBeenCalledWith('geb-8', expect.anything()));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('memberOnboarding.memberReactivated'));
  });

  it('koppelt op het M365-tabblad een functietitel aan een instrument', async () => {
    const { bediener } = await toon();
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.tabM365Settings' }));

    const instrument = await screen.findByLabelText('memberOnboarding.m365Settings.instrument');
    const knop = screen.getByRole('button', { name: 'memberOnboarding.m365Settings.add' });
    // Zolang er niets gekozen is kan er niets toegevoegd worden.
    expect(knop).toBeDisabled();

    await bediener.selectOptions(instrument, 'inst-1');
    await bediener.type(screen.getByLabelText('memberOnboarding.m365Settings.jobTitle'), '  Trompettist  ');
    expect(knop).toBeEnabled();

    await bediener.click(knop);
    await waitFor(() =>
      expect(api.createInstrumentJobTitleMapping).toHaveBeenCalledWith(
        { instrumentId: 'inst-1', jobTitle: 'Trompettist' },
        expect.anything(),
      ),
    );
  });

  it('wijzigt een bestaande functietitel, of laat hem met Escape staan', async () => {
    api.getInstrumentJobTitleMappings.mockResolvedValue([
      {
        id: 'kop-1',
        instrumentId: 'inst-1',
        instrumentName: 'Trompet',
        instrumentTuning: 'Bb',
        jobTitle: 'Trompettist',
      },
    ]);
    api.updateInstrumentJobTitleMapping.mockResolvedValue({});
    const { bediener } = await toon();
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.tabM365Settings' }));

    const rij = (await screen.findByText('Trompettist')).closest('tr') as HTMLElement;
    expect(within(rij).getByText(/Trompet \(Bb\)/)).toBeInTheDocument();
    // Het instrument staat niet meer in de keuzelijst hierboven: het heeft al
    // een functietitel.
    expect(
      within(screen.getByLabelText('memberOnboarding.m365Settings.instrument')).queryByRole('option', {
        name: /Trompet/,
      }),
    ).not.toBeInTheDocument();

    await bediener.click(within(rij).getByRole('button', { name: 'common.edit' }));
    const veld = within(rij).getByRole('textbox');
    await bediener.clear(veld);
    await bediener.type(veld, 'Eerste trompet');

    // Escape laat de wijziging vallen.
    await bediener.keyboard('{Escape}');
    expect(api.updateInstrumentJobTitleMapping).not.toHaveBeenCalled();
    expect(within(rij).getByText('Trompettist')).toBeInTheDocument();

    // Opnieuw, nu met de opslaanknop.
    await bediener.click(within(rij).getByRole('button', { name: 'common.edit' }));
    await bediener.clear(within(rij).getByRole('textbox'));
    await bediener.type(within(rij).getByRole('textbox'), 'Eerste trompet');
    await bediener.click(within(rij).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateInstrumentJobTitleMapping).toHaveBeenCalledWith('kop-1', 'Eerste trompet'));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('memberOnboarding.m365Settings.mappingUpdated'));
  });

  it('slaat een gewijzigde functietitel ook op met de entertoets', async () => {
    api.getInstrumentJobTitleMappings.mockResolvedValue([
      {
        id: 'kop-1',
        instrumentId: 'inst-1',
        instrumentName: 'Trompet',
        instrumentTuning: null,
        jobTitle: 'Trompettist',
      },
    ]);
    api.updateInstrumentJobTitleMapping.mockResolvedValue({});
    const { bediener } = await toon();
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.tabM365Settings' }));

    const rij = (await screen.findByText('Trompettist')).closest('tr') as HTMLElement;
    await bediener.click(within(rij).getByRole('button', { name: 'common.edit' }));
    await bediener.clear(within(rij).getByRole('textbox'));
    await bediener.type(within(rij).getByRole('textbox'), 'Bugel{Enter}');

    await waitFor(() => expect(api.updateInstrumentJobTitleMapping).toHaveBeenCalledWith('kop-1', 'Bugel'));
  });

  it('verwijdert een functietitelkoppeling pas na bevestiging', async () => {
    api.getInstrumentJobTitleMappings.mockResolvedValue([
      {
        id: 'kop-1',
        instrumentId: 'inst-1',
        instrumentName: 'Trompet',
        instrumentTuning: null,
        jobTitle: 'Trompettist',
      },
    ]);
    api.deleteInstrumentJobTitleMapping.mockResolvedValue({});
    const { bediener } = await toon();
    await bediener.click(screen.getByRole('button', { name: 'memberOnboarding.tabM365Settings' }));

    await bediener.click(
      within((await screen.findByText('Trompettist')).closest('tr') as HTMLElement).getByRole('button', {
        name: 'common.delete',
      }),
    );
    const venster = await screen.findByRole('alertdialog');
    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));
    expect(api.deleteInstrumentJobTitleMapping).not.toHaveBeenCalled();

    await bediener.click(
      within((await screen.findByText('Trompettist')).closest('tr') as HTMLElement).getByRole('button', {
        name: 'common.delete',
      }),
    );
    await bediener.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteInstrumentJobTitleMapping).toHaveBeenCalledWith('kop-1', expect.anything()));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('memberOnboarding.m365Settings.mappingDeleted'));
  });

  it('verbergt het M365-tabblad als de Microsoft-koppeling uit staat', async () => {
    api.getMicrosoftConfig.mockResolvedValue({ configured: false });
    const bediener = userEvent.setup({ delay: null });
    render(<Onboarding />, { wrapper: wikkel });

    await screen.findByLabelText(/memberOnboarding.firstName/);
    await waitFor(() => expect(api.getMicrosoftConfig).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: 'memberOnboarding.tabM365Settings' })).not.toBeInTheDocument();
    // En zonder Microsoft ook geen privé-adres om naar door te sturen.
    expect(screen.queryByLabelText('memberOnboarding.privateEmail')).not.toBeInTheDocument();

    // De aanmelding zelf werkt gewoon.
    await meldAan(bediener);
    await waitFor(() => expect(api.onboardMember).toHaveBeenCalled());
  });
});
