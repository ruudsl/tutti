/**
 * De kaartscanner: wat er gebeurde als de server niet meewerkte.
 *
 * Twee dingen kwamen hier samen, en ze versterkten elkaar.
 *
 * Ten eerste riep de online tak twee routes aan die aan de serverkant niet
 * bestaan: '/tickets/validate' om te controleren en '/tickets/scan' om af te
 * stempelen. Nergens in backend/src komt een van beide voor. De route die er
 * wél is - POST /tickets/:code/validate - doet allebei in één keer.
 *
 * Ten tweede werd `response.ok` niet gecontroleerd. Het antwoord van de 404
 * werd dus uitgelezen alsof het een scanuitslag was, en daar kwam
 * `{ valid: undefined, status: undefined, message: undefined }` uit. De
 * persoon aan de deur zag een lége foutmelding, bij elke bezoeker opnieuw.
 *
 * En omdat er geen fout gegooid werd, sloeg de terugval op de offline-controle
 * over. Die terugval is er voor een wegvallend netwerk; een route die niet
 * bestaat of een verlopen sessie is iets anders, en die door elkaar halen
 * hielp niemand.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineScanner } from '../OfflineScanner';
import * as ticketsApi from '../../api/tickets';
import { showError } from '../../utils/toast';

vi.mock('../../api/tickets');
vi.mock('../../api/ticket-scanning');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const origineel = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

beforeEach(() => {
  vi.clearAllMocks();
  // Een opslag die er wel is maar niets teruggeeft: genoeg om de scanner te
  // laten draaien zonder de melding over onbruikbare opslag.
  Object.defineProperty(globalThis, 'indexedDB', {
    value: { open: () => ({ result: null }) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (origineel) Object.defineProperty(globalThis, 'indexedDB', origineel);
  else delete (globalThis as Record<string, unknown>).indexedDB;
});

async function scan(code: string) {
  const gebruiker = userEvent.setup();
  render(<OfflineScanner concertId="con-1" />);
  await gebruiker.type(screen.getByLabelText('offlineScanner.scanOrEnter'), code);
  await gebruiker.click(screen.getByRole('button', { name: 'offlineScanner.validate' }));
}

describe('kaartscanner - de route die er echt is', () => {
  it('controleert en stempelt met één aanroep', async () => {
    vi.mocked(ticketsApi.validateTicket).mockResolvedValue({
      valid: true,
      status: 'used',
      message: 'Ticket validated and marked as used',
      ticket: {
        id: 'k1',
        code: 'ABC123',
        buyerName: 'Anna de Groot',
        ticketType: 'Volwassene',
        concertName: 'Voorjaarsconcert',
        concertDate: '2026-03-14',
      },
    });

    await scan('ABC123');

    // Eén aanroep, met de code en het concert. De tweede aanroep die hier
    // stond - '/tickets/scan' - bestond niet en is niet nodig: deze route
    // stempelt zelf af.
    await waitFor(() => expect(ticketsApi.validateTicket).toHaveBeenCalledWith('ABC123', 'con-1'));
    expect(ticketsApi.validateTicket).toHaveBeenCalledTimes(1);
  });
});

describe('kaartscanner - de server werkt niet mee', () => {
  it('meldt nooit een lege fouttekst', async () => {
    vi.mocked(ticketsApi.validateTicket).mockRejectedValue(new Error('mislukt'));

    await scan('ABC123');

    await waitFor(() => expect(showError).toHaveBeenCalled());
    // Dit was de kern: showError(undefined). Elke melding die de deur bereikt
    // hoort tekst te hebben.
    for (const aanroep of vi.mocked(showError).mock.calls) {
      expect(aanroep[0]).toBeTruthy();
    }
  });

  it('valt bij een storing terug op de offline-controle', async () => {
    // Een mislukking zonder antwoord is wat axios geeft bij een wegvallend
    // netwerk. Dán hoort de scanner op zijn eigen voorraad terug te vallen -
    // die is hier leeg, dus de kaart is onbekend, maar er komt wél een
    // uitslag met tekst in plaats van niets.
    vi.mocked(ticketsApi.validateTicket).mockRejectedValue(new Error('Network Error'));

    await scan('ONBEKEND');

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(vi.mocked(showError).mock.calls[0][0]).toBeTruthy();
  });
});
