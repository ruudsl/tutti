/**
 * Het afdrukvenster van een kaartje wordt met document.write gevuld en deelt
 * de herkomst van de app. De concertnaam en de naam van de koper zijn door
 * iemand ingevoerd; ze moeten er als tekst in komen, niet als opmaak of script.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import TicketDisplay from '../TicketDisplay';
import type { Ticket } from '../../types';

const SCRIPT = '<img src=x onerror="alert(1)">';

function kaartje(): Ticket {
  const volgendJaar = new Date();
  volgendJaar.setFullYear(volgendJaar.getFullYear() + 1);
  return {
    id: 'kaart-1',
    code: 'ABCD-EFGH-JKLM',
    buyerName: `Jan ${SCRIPT}`,
    status: 'valid',
    seatInfo: `Rij 3 ${SCRIPT}`,
    purchaseDate: new Date().toISOString(),
    usedAt: null,
    ticketType: 'Volwassene',
    concert: {
      id: 'concert-1',
      name: `Kerstconcert ${SCRIPT}`,
      date: volgendJaar.toISOString(),
      location: 'Zaal',
    },
    qrCodeDataUrl: 'data:image/png;base64,AAAA',
  };
}

describe('afdrukvenster van een kaartje', () => {
  let geschreven: string[];

  beforeEach(() => {
    geschreven = [];
    const venster = {
      document: {
        write: (html: string) => geschreven.push(html),
        close: () => {},
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(venster as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zet concertnaam, kopersnaam en plaats als tekst in het venster', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TicketDisplay ticket={kaartje()} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'tickets.downloadPdf' }));

    expect(geschreven).toHaveLength(1);
    const html = geschreven[0];
    expect(html).not.toContain(SCRIPT);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Kerstconcert &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('Jan &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('Rij 3 &lt;img');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
});
