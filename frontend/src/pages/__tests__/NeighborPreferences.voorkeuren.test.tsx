/**
 * Buurvoorkeuren: wie naast wie, en van welke vereniging.
 *
 * De aanleiding voor dit bestand: aan de serverkant bleek dat een
 * buurvoorkeur van een ándere vereniging zichtbaar kon zijn. De server
 * controleert nu per orkest en per lid. Deze tests kijken wat de pagina zelf
 * doet met die grens:
 *
 *   - Wordt er per orkest opgehaald, en verdwijnt de lijst van het vorige
 *     orkest zodra je wisselt? Zie 'wisselen van orkest'. Zou de pagina de
 *     antwoorden onder één sleutel bewaren, dan bleef de vorige lijst staan
 *     terwijl de kop het nieuwe orkest noemt - precies het beeld dat een lezer
 *     als "voorkeur van een ander orkest" zou lezen.
 *   - Krijgt het formulier alleen leden van het gekozen orkest te zien? Zie
 *     'alleen leden van het gekozen orkest'. Een lid van een andere vereniging
 *     zit wel in het antwoord van getUsers (die lijst is niet per orkest),
 *     maar hoort hier niet kiesbaar te zijn.
 *
 * Beide zijn *wachten* en geen bewijs: de pagina doet dit vandaag al goed. Ze
 * staan er omdat dit precies de twee plekken zijn waar de scheiding stilletjes
 * kan sneuvelen, en omdat je aan het scherm niet ziet dat het misgaat - je
 * ziet alleen een naam die er niet hoort te staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import NeighborPreferences from '../NeighborPreferences';
import * as api from '../../api';
import { showError, showSuccess } from '../../utils/toast';
import type { SeatingNeighbor, User } from '../../types';

vi.mock('../../api');
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string) => sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

// De bevestigingsvraag bij verwijderen is per test te zetten.
let bevestigAntwoord = true;
const bevestig = vi.fn(async () => bevestigAntwoord);
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

let ingelogdeGebruiker: { id: string; role: string } | null = { id: 'geb-0', role: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: ingelogdeGebruiker }),
}));

const HARMONIE = { id: 'ork-1', name: 'Harmonie' };
const FANFARE = { id: 'ork-2', name: 'Fanfare' };

function gebruiker(id: string, voornaam: string, achternaam: string, orkesten: { id: string; name: string }[]): User {
  return {
    id,
    email: `${id}@orkest.nl`,
    firstName: voornaam,
    lastName: achternaam,
    role: 'member',
    associationId: 'ver-1',
    orchestras: orkesten,
  } as User;
}

function voorkeur(id: string, lid: string, buur: string, soort: 'preferred' | 'avoid'): SeatingNeighbor {
  return {
    id,
    userId: `${id}-a`,
    userName: lid,
    neighborUserId: `${id}-b`,
    neighborUserName: buur,
    preference: soort,
  };
}

function toon(element: ReactElement = <NeighborPreferences />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

/**
 * De toevoegknop staat er twee keer: in de kop en in het lege vak. Beide doen
 * hetzelfde, dus hier wordt de eerste gebruikt.
 */
async function openToevoegvenster(gebruikerActie: ReturnType<typeof userEvent.setup>) {
  const knoppen = await screen.findAllByRole('button', { name: 'neighborPreferences.add' });
  await gebruikerActie.click(knoppen[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  bevestigAntwoord = true;
  ingelogdeGebruiker = { id: 'geb-0', role: 'admin' };
  vi.mocked(api.getOrchestras).mockResolvedValue([HARMONIE, FANFARE] as never);
  vi.mocked(api.getUsers).mockResolvedValue([
    gebruiker('u1', 'Anna', 'Aalders', [HARMONIE]),
    gebruiker('u2', 'Bram', 'Bakker', [HARMONIE]),
    gebruiker('u3', 'Chris', 'Claassen', [FANFARE]),
  ] as never);
  vi.mocked(api.getSeatingNeighbors).mockResolvedValue([]);
  vi.mocked(api.createSeatingNeighbor).mockResolvedValue({ id: 'v-nieuw', message: 'ok' });
  vi.mocked(api.deleteSeatingNeighbor).mockResolvedValue({ message: 'ok' });
});

describe('buurvoorkeuren - de grens van het orkest', () => {
  it('kiest het eerste orkest en haalt daar de voorkeuren van op', async () => {
    toon();

    await waitFor(() => expect(api.getSeatingNeighbors).toHaveBeenCalledWith('ork-1'));
    expect(api.getSeatingNeighbors).not.toHaveBeenCalledWith('ork-2');
  });

  it('wisselen van orkest laat de voorkeuren van het vorige orkest niet staan', async () => {
    vi.mocked(api.getSeatingNeighbors).mockImplementation(async (orkestId: string) =>
      orkestId === 'ork-1'
        ? [voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred')]
        : [voorkeur('v2', 'Chris Claassen', 'Dirk Dekker', 'avoid')],
    );
    const gebruikerActie = toon();

    expect(await screen.findByText('Anna Aalders')).toBeInTheDocument();

    await gebruikerActie.selectOptions(screen.getByLabelText('seating.selectOrchestra'), 'ork-2');

    expect(await screen.findByText('Chris Claassen')).toBeInTheDocument();
    expect(screen.queryByText('Anna Aalders')).not.toBeInTheDocument();
    expect(screen.queryByText('Bram Bakker')).not.toBeInTheDocument();
  });

  it('biedt in het formulier alleen leden van het gekozen orkest aan', async () => {
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);

    const lidkeuze = screen.getByLabelText('neighborPreferences.member');
    expect(within(lidkeuze).getByRole('option', { name: 'Anna Aalders' })).toBeInTheDocument();
    expect(within(lidkeuze).getByRole('option', { name: 'Bram Bakker' })).toBeInTheDocument();
    // Chris speelt in het andere orkest en hoort hier niet kiesbaar te zijn.
    expect(within(lidkeuze).queryByRole('option', { name: 'Chris Claassen' })).not.toBeInTheDocument();
  });

  it('laat het gekozen lid niet ook als zijn eigen buur kiezen', async () => {
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.member'), 'u1');

    const buurkeuze = screen.getByLabelText('neighborPreferences.neighbor');
    expect(within(buurkeuze).queryByRole('option', { name: 'Anna Aalders' })).not.toBeInTheDocument();
    expect(within(buurkeuze).getByRole('option', { name: 'Bram Bakker' })).toBeInTheDocument();
  });

  it('haalt de ledenlijst niet op voor een gewoon lid', async () => {
    ingelogdeGebruiker = { id: 'geb-9', role: 'member' };
    toon();

    await waitFor(() => expect(api.getSeatingNeighbors).toHaveBeenCalled());
    expect(api.getUsers).not.toHaveBeenCalled();
  });
});

describe('buurvoorkeuren - de lijst', () => {
  it('telt de voorkeuren per soort en zet er de juiste tekst bij', async () => {
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([
      voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred'),
      voorkeur('v2', 'Bram Bakker', 'Anna Aalders', 'preferred'),
      voorkeur('v3', 'Anna Aalders', 'Chris Claassen', 'avoid'),
    ]);
    toon();

    const wel = await screen.findAllByText('neighborPreferences.wantsToSitWith');
    expect(wel).toHaveLength(2);
    expect(screen.getAllByText('neighborPreferences.prefersNotToSitWith')).toHaveLength(1);

    const tellers = document.querySelectorAll('.stat-value');
    expect(tellers[0]).toHaveTextContent('2');
    expect(tellers[1]).toHaveTextContent('1');
  });

  it('filtert op soort zonder de tellers te veranderen', async () => {
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([
      voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred'),
      voorkeur('v3', 'Anna Aalders', 'Chris Claassen', 'avoid'),
    ]);
    const gebruikerActie = toon();

    await screen.findByText('Bram Bakker');
    await gebruikerActie.selectOptions(screen.getByLabelText('common.filter'), 'avoid');

    expect(screen.getByText('Chris Claassen')).toBeInTheDocument();
    expect(screen.queryByText('Bram Bakker')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.stat-value')[0]).toHaveTextContent('1');
  });

  it('meldt het als er nog geen voorkeuren zijn', async () => {
    toon();

    expect(await screen.findByText('neighborPreferences.noPreferences')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('toont een gewoon lid geen toevoeg- of verwijderknop', async () => {
    ingelogdeGebruiker = { id: 'geb-9', role: 'member' };
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred')]);
    toon();

    expect(await screen.findByText('Anna Aalders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'neighborPreferences.add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
  });

  it('houdt de toevoegknop uit als het orkest minder dan twee leden heeft', async () => {
    vi.mocked(api.getUsers).mockResolvedValue([gebruiker('u1', 'Anna', 'Aalders', [HARMONIE])] as never);
    toon();

    await waitFor(() => {
      for (const knop of screen.getAllByRole('button', { name: 'neighborPreferences.add' })) {
        expect(knop).toBeDisabled();
      }
    });
  });

  it('toont een skelet zolang de orkesten nog niet binnen zijn', () => {
    vi.mocked(api.getOrchestras).mockReturnValue(new Promise(() => {}) as never);
    toon();

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
  });
});

describe('buurvoorkeuren - toevoegen en verwijderen', () => {
  it('slaat een voorkeur op bij het gekozen orkest en ververst de lijst', async () => {
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.member'), 'u1');
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.preferenceType'), 'avoid');
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.neighbor'), 'u2');
    await gebruikerActie.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createSeatingNeighbor).toHaveBeenCalledWith({
        orchestraId: 'ork-1',
        userId: 'u1',
        neighborUserId: 'u2',
        preference: 'avoid',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('neighborPreferences.saved');
    await waitFor(() => expect(api.getSeatingNeighbors).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('neighborPreferences.neighbor')).not.toBeInTheDocument();
  });

  it('laat het venster openstaan en toont het serverbericht als de server weigert', async () => {
    vi.mocked(api.createSeatingNeighbor).mockRejectedValue({
      response: { data: { error: 'Lid niet gevonden.' } },
    });
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.member'), 'u1');
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.neighbor'), 'u2');
    await gebruikerActie.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Lid niet gevonden.'));
    // Het formulier blijft staan, met de ingevulde keuzes, zodat de gebruiker
    // kan verbeteren in plaats van opnieuw te beginnen.
    expect(screen.getByLabelText('neighborPreferences.neighbor')).toHaveValue('u2');
  });

  it('valt terug op een algemene melding als de server niets uitlegt', async () => {
    vi.mocked(api.createSeatingNeighbor).mockRejectedValue(new Error('netwerk weg'));
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.member'), 'u1');
    await gebruikerActie.selectOptions(screen.getByLabelText('neighborPreferences.neighbor'), 'u2');
    await gebruikerActie.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('common.error'));
  });

  it('weigert een lid als zijn eigen buur', async () => {
    // De keuzelijst laat dit niet toe, dus het formulier wordt hier
    // rechtstreeks ingediend - zoals een browser zonder javascript-validatie
    // zou doen. De pagina hoort zelf nee te zeggen.
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('neighborPreferences.cannotSelectSelf'));
    expect(api.createSeatingNeighbor).not.toHaveBeenCalled();
  });

  it('sluit het venster met annuleren zonder iets op te slaan', async () => {
    const gebruikerActie = toon();

    await openToevoegvenster(gebruikerActie);
    await gebruikerActie.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByLabelText('neighborPreferences.neighbor')).not.toBeInTheDocument();
    expect(api.createSeatingNeighbor).not.toHaveBeenCalled();
  });

  it('verwijdert een voorkeur na bevestiging', async () => {
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred')]);
    const gebruikerActie = toon();

    await gebruikerActie.click(await screen.findByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteSeatingNeighbor).toHaveBeenCalledWith('v1'));
    expect(showSuccess).toHaveBeenCalledWith('neighborPreferences.deleted');
  });

  it('verwijdert niets als de bevestiging wordt afgewezen', async () => {
    bevestigAntwoord = false;
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred')]);
    const gebruikerActie = toon();

    await gebruikerActie.click(await screen.findByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(bevestig).toHaveBeenCalled());
    expect(api.deleteSeatingNeighbor).not.toHaveBeenCalled();
  });

  it('toont het serverbericht als verwijderen wordt geweigerd', async () => {
    vi.mocked(api.getSeatingNeighbors).mockResolvedValue([voorkeur('v1', 'Anna Aalders', 'Bram Bakker', 'preferred')]);
    vi.mocked(api.deleteSeatingNeighbor).mockRejectedValue({
      response: { data: { error: 'Buurvoorkeur niet gevonden.' } },
    });
    const gebruikerActie = toon();

    await gebruikerActie.click(await screen.findByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Buurvoorkeur niet gevonden.'));
    expect(screen.getByText('Anna Aalders')).toBeInTheDocument();
  });
});
