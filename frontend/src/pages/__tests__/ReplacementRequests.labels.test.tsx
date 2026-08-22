/**
 * De labels van de vervangingsaanvragen horen bij hun veld.
 *
 * In beide vensters - een aanvraag maken en een muzikant uitnodigen - stonden
 * label en veld los naast elkaar in dezelfde `form-group`, zonder `htmlFor` en
 * zonder `id`. Een schermlezer kondigde een bewerkbaar veld aan zonder te
 * zeggen wat erin moest, klikken op het label zette de aanwijzer nergens, en
 * een test kon het veld niet op naam vinden.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Tien velden lopen sinds de ombouw via `components/FormField`. De muzikantkeuze
 * is met de hand gekoppeld omdat er een melding in dezelfde `form-group` staat
 * wanneer er niemand op dat instrument te vinden is; ook die staat hieronder,
 * want handwerk raakt eerder zoek dan een component.
 *
 * Het detailvenster is een geval apart. Daar staat geen enkel veld: alleen
 * uitgelezen waarden met een kopje erboven, en een kop boven de tabel met
 * uitnodigingen. Die kopjes waren `<label>`-en, en een label belooft iets te
 * bedienen dat er niet is - een schermlezer kondigt "label" aan zonder dat er
 * iets bij hoort. Ze zijn nu `<span>`-en met dezelfde klasse. De test daarvoor
 * telt de `<label>`-en in dat venster: nul.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ReplacementRequests from '../ReplacementRequests';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

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

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'admin' } }),
}));

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { AANVRAAG, houder, muteerder } = vi.hoisted(() => ({
  AANVRAAG: {
    id: 'aanvraag-1',
    eventType: 'concert',
    eventId: 'concert-1',
    eventName: 'Voorjaarsconcert',
    eventDate: '2026-09-12',
    eventLocation: 'De Kruisboog',
    instrumentId: 'inst-1',
    instrumentName: 'Trompet',
    instrumentTuning: 'Bb',
    positionsNeeded: 2,
    positionsFilled: 0,
    confirmedCount: 0,
    urgency: 'normal',
    status: 'open',
  },
  // Het detail is per test in te stellen; standaard leeg, zodat de bestaande
  // tests van de invoervensters er niets van merken.
  houder: { detail: null as unknown },
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useReplacementRequests', () => ({
  useReplacementRequests: () => ({ data: [AANVRAAG], isLoading: false }),
  useReplacementRequest: () => ({ data: houder.detail }),
  useCreateReplacementRequest: muteerder,
  useCancelReplacementRequest: muteerder,
  useInviteMusician: muteerder,
  useUpdateAssignment: muteerder,
}));

// Leeg, zodat de melding onder de muzikantkeuze verschijnt
vi.mock('../../hooks/useExternalMusicians', () => ({
  useExternalMusicianSearch: () => ({ data: [] }),
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] }),
}));

vi.mock('../../hooks/useConcerts', () => ({
  useConcerts: () => ({ data: { data: [{ id: 'concert-1', name: 'Voorjaarsconcert', date: '2026-09-12' }] } }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openVenster(knopnaam: RegExp) {
  const gebruiker = userEvent.setup();
  render(<ReplacementRequests />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: knopnaam }));
  return { gebruiker, venster: await screen.findByRole('dialog') };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  houder.detail = null;
});

/** Open het detailvenster van een aanvraag zoals een lezer dat doet. */
async function openDetailvenster() {
  houder.detail = {
    ...AANVRAAG,
    deadline: '2026-08-30',
    notes: 'Graag iemand met eigen partituur',
    assignments: [],
  };
  const gebruiker = userEvent.setup();
  render(<ReplacementRequests />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: 'Voorjaarsconcert' }));
  return await screen.findByRole('dialog');
}

describe('vervangingsaanvragen - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het aanvraagvenster op hun labeltekst', async () => {
    const { venster } = await openVenster(/replacementRequests.createRequest/);

    expect(within(venster).getByLabelText(/replacementRequests.eventType/).tagName).toBe('SELECT');
    expect(within(venster).getByLabelText(/replacementRequests.event\b/).tagName).toBe('SELECT');
    expect(within(venster).getByLabelText(/common.date/)).toHaveAttribute('type', 'date');
    expect(within(venster).getByLabelText(/replacementRequests.instrument/).tagName).toBe('SELECT');
    expect(within(venster).getByLabelText(/replacementRequests.positions/)).toHaveAttribute('type', 'number');
    expect(within(venster).getByLabelText(/replacementRequests.urgency/).tagName).toBe('SELECT');
    expect(within(venster).getByLabelText('replacementRequests.deadline')).toHaveAttribute('type', 'date');
    expect(within(venster).getByLabelText('common.notes').tagName).toBe('TEXTAREA');
  });

  it('houdt het gebeurtenisveld gekoppeld als het van keuzelijst naar tekstveld wisselt', async () => {
    const { gebruiker, venster } = await openVenster(/replacementRequests.createRequest/);

    // Bij een repetitie staat er een tekstveld waar bij een concert een
    // keuzelijst stond. Wat het ook wordt, het label hoort erbij te blijven.
    await gebruiker.selectOptions(within(venster).getByLabelText(/replacementRequests.eventType/), 'rehearsal');

    expect(within(venster).getByLabelText(/replacementRequests.event\b/)).toHaveAttribute(
      'placeholder',
      'replacementRequests.rehearsalId',
    );
  });

  it('vindt de velden van het uitnodigingsvenster, ook het met de hand gekoppelde', async () => {
    const { venster } = await openVenster(/replacementRequests.invite/);

    const muzikant = within(venster).getByLabelText(/replacementRequests.selectMusician/);
    expect(muzikant.tagName).toBe('SELECT');

    // De melding "geen muzikanten voor dit instrument" staat buiten het label,
    // dus alleen aria-describedby brengt hem bij het veld.
    const melding = within(venster).getByText('replacementRequests.noMusiciansForInstrument');
    expect(muzikant).toHaveAttribute('aria-describedby', melding.getAttribute('id'));

    expect(within(venster).getByLabelText('replacementRequests.fee')).toHaveAttribute('type', 'number');
    expect(within(venster).getByLabelText('common.notes').tagName).toBe('TEXTAREA');
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const { gebruiker, venster } = await openVenster(/replacementRequests.invite/);

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(within(venster).getByText('replacementRequests.fee'));
    expect(within(venster).getByLabelText('replacementRequests.fee')).toHaveFocus();
  });
});

describe('vervangingsaanvragen - het detailvenster labelt niets, dus staat er geen label', () => {
  it('toont de kopjes zonder er een label van te maken', async () => {
    const venster = await openDetailvenster();

    // Er valt in dit venster niets te bedienen: elke waarde is uitgelezen
    // tekst. Vóór de reparatie stonden hier zeven <label>-en die naar niets
    // wezen; nu hoort er geen enkele meer te staan.
    expect(venster.querySelectorAll('label')).toHaveLength(0);

    // De kopjes zelf zijn niet verdwenen - ze zien er hetzelfde uit.
    for (const kopje of [
      'common.date',
      'replacementRequests.urgency',
      'common.status',
      'replacementRequests.positions',
      'replacementRequests.deadline',
      'common.notes',
      'replacementRequests.invitations',
    ]) {
      const element = within(venster).getByText(kopje);
      expect(element.tagName).toBe('SPAN');
      expect(element).toHaveClass('form-label');
    }
  });

  it('laat geen enkel label op de pagina naar niets wijzen', async () => {
    await openDetailvenster();

    // Ruimer dan het venster alleen: elk <label> dat de pagina toont hoort een
    // veld te hebben - via htmlFor, of doordat het er een omsluit. Een label
    // dat aan geen van beide voldoet belooft iets te bedienen wat er niet is.
    const zonderVeld = [...document.querySelectorAll('label')].filter(
      (label) => !label.htmlFor && !label.querySelector('input, select, textarea'),
    );

    expect(zonderVeld.map((label) => label.textContent)).toEqual([]);
  });
});
