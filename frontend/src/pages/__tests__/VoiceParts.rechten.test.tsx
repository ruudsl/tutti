/**
 * Stemverdeling: wat een gewoon lid ziet tegenover een beheerder.
 *
 * Deze pagina laat per sectie zien wie waar zit en welke stem die speelt. Het
 * toewijzen van een stem is beheerderswerk: alleen een beheerder, de
 * muziekcommissie en de dirigent mogen het. Voor iedereen anders is de pagina
 * een leeslijst.
 *
 * Dat onderscheid staat op drie plekken in de tekening (de kolom Acties, de
 * knop Bewerken en het aanklikbare stemveld) en die drie moeten het eens zijn.
 * Eén ervan overslaan geeft een lid een knop die de server toch weigert - of
 * erger, een knop die het wel doet. Daarom kijkt elke test hieronder naar alle
 * drie tegelijk.
 *
 * De laatste test gaat over een lid van een andere vereniging: de pagina groept
 * toewijzingen op sectie, en een toewijzing die bij geen enkele bekende sectie
 * hoort mag niet alsnog ergens onderaan opduiken.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import VoiceParts from '../VoiceParts';

const { stand, opslaan } = vi.hoisted(() => ({
  stand: {
    rol: 'member',
    orkesten: [
      { id: 'ork-1', name: 'Harmonie' },
      { id: 'ork-2', name: 'Slagwerkgroep' },
    ],
    secties: [
      { id: 'sec-1', name: 'Klarinetten' },
      { id: 'sec-2', name: 'Trompetten' },
    ],
    toewijzingen: [
      { id: 'toe-1', sectionId: 'sec-1', userName: 'Marieke de Vries', instruments: 'Klarinet', seatLabel: '1e stem', positionInSection: 2 },
      { id: 'toe-2', sectionId: 'sec-1', userName: 'Joris Bakker', instruments: 'Klarinet', seatLabel: null, positionInSection: 1 },
      { id: 'toe-3', sectionId: 'sec-2', userName: 'Anne Peters', instruments: null, seatLabel: 'Solo', positionInSection: 1 },
    ] as Record<string, unknown>[],
  },
  opslaan: vi.fn(),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: stand.rol } }),
}));

vi.mock('../../api', () => ({
  getOrchestras: async () => stand.orkesten,
  getSeatingSections: async () => stand.secties,
  getSeatingAssignments: async () => stand.toewijzingen,
  updateSeatingAssignment: (...args: unknown[]) => opslaan(...args),
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

/** Teken de pagina en wacht tot de eerste sectie er staat. */
async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<VoiceParts />, { wrapper: wikkel });
  await screen.findByRole('heading', { name: 'Klarinetten' });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stand.rol = 'member';
  opslaan.mockResolvedValue({});
});

describe('stemverdeling - een gewoon lid leest alleen', () => {
  it('geeft een lid geen kolom Acties, geen knop Bewerken en geen aanklikbaar stemveld', async () => {
    await toonPagina();

    // Geen kolomkop Acties in de tabel.
    expect(screen.queryByRole('columnheader', { name: 'common.actions' })).toBeNull();
    // Geen knoppen om iets te wijzigen: op deze pagina staan er voor een lid
    // helemaal geen knoppen.
    expect(screen.queryByRole('button', { name: 'common.edit' })).toBeNull();
    // En de lege stem nodigt niet uit tot klikken; er staat een streepje.
    expect(screen.queryByText('voiceParts.clickToAssign')).toBeNull();
  });

  it('laat een lid een lege stem als streepje zien in plaats van als uitnodiging', async () => {
    await toonPagina();

    const rij = screen.getByText('Joris Bakker').closest('tr')!;
    expect(within(rij).getByText('-')).toBeInTheDocument();
  });

  it('opent geen invoerveld als een lid op de stem klikt', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByText('1e stem'));

    expect(screen.queryByPlaceholderText('voiceParts.enterVoice')).toBeNull();
    expect(opslaan).not.toHaveBeenCalled();
  });
});

describe('stemverdeling - een beheerder wijst toe', () => {
  beforeEach(() => {
    stand.rol = 'admin';
  });

  it('geeft een beheerder wel de kolom Acties en een knop per lid', async () => {
    await toonPagina();

    expect(screen.getAllByRole('columnheader', { name: 'common.actions' }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'common.edit' })).toHaveLength(3);
    // De lege stem is voor een beheerder een uitnodiging.
    expect(screen.getByText('voiceParts.clickToAssign')).toBeInTheDocument();
  });

  it('slaat een nieuwe stem op via de knop Opslaan', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Joris Bakker').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));

    const veld = within(rij).getByPlaceholderText('voiceParts.enterVoice');
    await gebruiker.type(veld, '2e stem');
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledWith('toe-2', { seatLabel: '2e stem' }));
    expect(meldingen.goed).toHaveBeenCalledWith('voiceParts.saved');
  });

  it('neemt de bestaande stem over in het veld en slaat op met Enter', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Marieke de Vries').closest('tr')!;
    await gebruiker.click(within(rij).getByText('1e stem'));

    const veld = within(rij).getByPlaceholderText('voiceParts.enterVoice');
    expect(veld).toHaveValue('1e stem');

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Solo{Enter}');

    await waitFor(() => expect(opslaan).toHaveBeenCalledWith('toe-1', { seatLabel: 'Solo' }));
  });

  it('laat de wijziging vallen bij Escape en bij Annuleren', async () => {
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Marieke de Vries').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));
    await gebruiker.type(within(rij).getByPlaceholderText('voiceParts.enterVoice'), 'x{Escape}');

    expect(within(rij).queryByPlaceholderText('voiceParts.enterVoice')).toBeNull();
    expect(opslaan).not.toHaveBeenCalled();

    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.cancel' }));

    expect(within(rij).queryByPlaceholderText('voiceParts.enterVoice')).toBeNull();
    expect(opslaan).not.toHaveBeenCalled();
  });

  it('toont de melding van de server als opslaan wordt geweigerd', async () => {
    opslaan.mockRejectedValue({ response: { data: { error: 'Geen toegang tot dit orkest.' } } });
    const gebruiker = await toonPagina();

    const rij = screen.getByText('Anne Peters').closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.edit' }));
    await gebruiker.click(within(rij).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(meldingen.fout).toHaveBeenCalledWith('Geen toegang tot dit orkest.'));
    // Het veld blijft open, zodat de beheerder het kan verbeteren.
    expect(within(rij).getByPlaceholderText('voiceParts.enterVoice')).toBeInTheDocument();
  });
});

describe('stemverdeling - wat er in de lijst staat', () => {
  it('sorteert op plaats in de sectie en nummert vanaf één', async () => {
    await toonPagina();

    const klarinetten = screen.getByRole('heading', { name: 'Klarinetten' }).closest('.card')!;
    const rijen = within(klarinetten).getAllByRole('row').slice(1);

    // Joris staat op plaats 1 en Marieke op plaats 2, ook al kwamen ze in de
    // andere volgorde binnen.
    expect(within(rijen[0]).getByText('Joris Bakker')).toBeInTheDocument();
    expect(within(rijen[0]).getByText('1')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('Marieke de Vries')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('2')).toBeInTheDocument();
  });

  it('filtert op sectie en laat de andere sectie dan weg', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.selectOptions(screen.getByLabelText('voiceParts.filterBySection'), 'sec-2');

    expect(screen.getByRole('heading', { name: 'Trompetten' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Klarinetten' })).toBeNull();
    expect(screen.queryByText('Marieke de Vries')).toBeNull();
  });

  it('toont een streepje als er geen instrument bekend is', async () => {
    await toonPagina();

    const rij = screen.getByText('Anne Peters').closest('tr')!;
    expect(within(rij).getByText('-')).toBeInTheDocument();
  });

  it('laat een toewijzing uit een sectie die niet van dit orkest is nergens opduiken', async () => {
    // Zo'n regel hoort bij een andere vereniging. Hij mag niet stilzwijgend
    // onder de eerste de beste sectie belanden en ook niet als losse rij
    // onderaan verschijnen.
    stand.toewijzingen = [
      ...stand.toewijzingen,
      {
        id: 'toe-vreemd',
        sectionId: 'sec-van-andere-vereniging',
        userName: 'Iemand Anders',
        instruments: 'Tuba',
        seatLabel: 'Solo',
        positionInSection: 1,
      },
    ];

    await toonPagina();

    expect(screen.queryByText('Iemand Anders')).toBeNull();
    // En de sectietelling klopt nog: twee klarinettisten, één trompettist.
    expect(screen.getAllByText(/voiceParts.members/).map((e) => e.textContent)).toEqual([
      '2 voiceParts.members',
      '1 voiceParts.members',
    ]);

    stand.toewijzingen = stand.toewijzingen.filter((t) => t.id !== 'toe-vreemd');
  });

  it('toont een lege sectie als zodanig in plaats van een lege tabel', async () => {
    stand.secties = [...stand.secties, { id: 'sec-3', name: 'Slagwerk' }];

    await toonPagina();

    const slagwerk = screen.getByRole('heading', { name: 'Slagwerk' }).closest('.card')!;
    expect(within(slagwerk).getByText('voiceParts.noMembers')).toBeInTheDocument();
    expect(within(slagwerk).queryByRole('table')).toBeNull();

    stand.secties = stand.secties.filter((s) => s.id !== 'sec-3');
  });

  it('meldt het als er helemaal geen secties zijn', async () => {
    stand.secties = [];

    render(<VoiceParts />, { wrapper: wikkel });

    expect(await screen.findByText('voiceParts.noSections')).toBeInTheDocument();

    stand.secties = [
      { id: 'sec-1', name: 'Klarinetten' },
      { id: 'sec-2', name: 'Trompetten' },
    ];
  });

  it('laat de bezoeker van orkest wisselen', async () => {
    const gebruiker = await toonPagina();

    const keuze = screen.getByLabelText('seating.selectOrchestra');
    expect(keuze).toHaveValue('ork-1');

    await gebruiker.selectOptions(keuze, 'ork-2');
    expect(keuze).toHaveValue('ork-2');
  });
});
