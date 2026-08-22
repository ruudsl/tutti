/**
 * De labels in het afhandelvenster van de meldingen: twee soorten in één venster.
 *
 * Dit venster had drie `form-label`s zonder koppeling, en juist hier lopen de
 * twee soorten door elkaar heen.
 *
 * Boven "partij" en "oorspronkelijke melding" staat geen veld maar een `<p>`
 * met een uitgelezen waarde. Dat is opmaak, geen formulierlabel: er valt niets
 * te bedienen, dus een `htmlFor` kan er niet eens naartoe wijzen. Een
 * schermlezer kondigde daar wél "label" aan - een lege belofte. Die twee zijn
 * een `<span>` met dezelfde klasse geworden, zodat het er hetzelfde uitziet en
 * de belofte weg is.
 *
 * Het derde label staat boven een echte `<textarea>` en is dus wél een
 * formulierlabel. Dat loopt sinds de ombouw via `components/FormField` en is
 * hieronder met `getByLabelText` te vinden - de zoekmethode die een veld alleen
 * vindt als de koppeling er echt is.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Issues from '../Issues';

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { MELDING } = vi.hoisted(() => ({
  MELDING: {
    id: 'mld-1',
    piece_title: 'Also sprach Zarathustra',
    piece_id: 'partij-1',
    instrument_name: 'Trompet',
    issue_type: 'missing_page',
    description: 'Bladzijde 3 ontbreekt.',
    status: 'open',
    reported_by_name: 'Anna de Groot',
    reported_by_email: 'anna@example.org',
    created_at: '2026-08-01T10:00:00.000Z',
  },
}));

vi.mock('../../api', () => ({
  getIssues: async () => [MELDING],
  getMyIssues: async () => [MELDING],
  getIssueStats: async () => ({ open: 1, in_review: 0, resolved: 0, rejected: 0 }),
  updateIssueStatus: async () => ({}),
  deleteIssue: async () => ({}),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => async () => true }));

// De melding wordt afgehandeld door de muziekcommissie; anders staat de
// statuskeuzelijst die het venster opent er niet.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'music_committee' } }),
}));

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

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Zet de melding op "afgehandeld"; dat opent het afhandelvenster. */
async function openAfhandelvenster() {
  const gebruiker = userEvent.setup();
  render(<Issues />, { wrapper: wikkel });
  const statuskeuze = await screen.findByDisplayValue('issues.status.open');
  await gebruiker.selectOptions(statuskeuze, 'resolved');
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meldingen - het antwoordveld hoort bij zijn label', () => {
  it('vindt het antwoordveld op zijn labeltekst', async () => {
    await openAfhandelvenster();

    // De labeltekst is samengesteld uit twee vertaalsleutels, dus we zoeken met
    // een reguliere uitdrukking.
    const veld = await screen.findByLabelText(/issues\.responseNotes/);
    expect(veld.tagName).toBe('TEXTAREA');
  });

  it('typt in het antwoordveld dat bij het aangeklikte label hoort', async () => {
    const gebruiker = await openAfhandelvenster();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(await screen.findByText(/issues\.responseNotes/));
    await gebruiker.keyboard('Nieuwe partij besteld.');

    expect(screen.getByLabelText(/issues\.responseNotes/)).toHaveValue('Nieuwe partij besteld.');
  });
});

describe('meldingen - de opschriften boven de uitgelezen waarden labelen niets', () => {
  it('zet geen <label> boven de partijnaam en de oorspronkelijke melding', async () => {
    await openAfhandelvenster();

    // "issues.table.piece" staat ook als kolomkop in de tabel erachter, dus we
    // zoeken binnen het venster.
    const venster = await screen.findByRole('dialog');
    for (const sleutel of ['issues.table.piece', 'issues.originalIssue']) {
      const opschrift = within(venster).getByText(sleutel);
      // Er staat een <p> onder, geen bedienbaar veld. Een <label> zou hier een
      // belofte doen die de browser niet kan nakomen.
      expect(opschrift.tagName).toBe('SPAN');
      expect(opschrift.closest('label')).toBeNull();
      // Maar het ziet er nog precies hetzelfde uit.
      expect(opschrift).toHaveClass('form-label');
    }
  });

  it('houdt in het afhandelvenster maar één <label> over, en die wijst naar het antwoordveld', async () => {
    await openAfhandelvenster();

    const venster = await screen.findByRole('dialog');
    const labels = Array.from(venster.querySelectorAll('label'));
    expect(labels).toHaveLength(1);
    expect(labels[0].getAttribute('for')).toBe(screen.getByLabelText(/issues\.responseNotes/).id);
  });
});
