/**
 * De labels van het muzikantenformulier horen bij hun veld.
 *
 * In het venster "Muzikant toevoegen" stonden label en veld los naast elkaar in
 * dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een schermlezer
 * kondigde een bewerkbaar veld aan zonder te zeggen wat erin moest, klikken op
 * het label zette de aanwijzer nergens, en een test kon het veld niet op naam
 * vinden.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Zes velden lopen sinds de ombouw via `components/FormField`. Twee koppen
 * blijven een kop: boven de sterbeoordeling staan vijf knoppen en boven de
 * instrumenten een rij per instrument met twee keuzelijsten en een knop. Daar
 * hoort geen `<label>` maar een groepskop, en ook dat staat hieronder.
 *
 * Het detailvenster is een geval apart. Daar staat geen enkel veld: alleen
 * uitgelezen waarden met een kopje erboven. Die kopjes waren `<label>`-en, en
 * een label belooft iets te bedienen dat er niet is - een schermlezer kondigt
 * "label" aan zonder dat er iets bij hoort. Ze zijn nu `<span>`-en met dezelfde
 * klasse. De test daarvoor telt de `<label>`-en in dat venster: nul.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ExternalMusicians from '../ExternalMusicians';

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

const { muteerder, houder, MUZIKANT, MUZIKANT_DETAIL } = vi.hoisted(() => {
  const MUZIKANT = {
    id: 'muz-1',
    firstName: 'Marieke',
    lastName: 'de Vries',
    email: 'marieke@example.org',
    phone: '0612345678',
    musicianType: 'guest',
    instrumentNames: 'Trompet',
    rating: 4,
    totalPerformances: 7,
    isActive: true,
  };
  return {
    MUZIKANT,
    MUZIKANT_DETAIL: {
      ...MUZIKANT,
      notes: 'Speelt graag hoge partijen',
      lastPlayedDate: '2026-05-04',
      instruments: [
        { id: 'i-1', instrumentName: 'Trompet', instrumentTuning: 'Bb', isPrimary: true, skillLevel: 'advanced' },
      ],
      recentAssignments: [],
    },
    // De lijst en het detail zijn per test in te stellen; standaard leeg, zodat
    // de bestaande tests van het invoervenster niets van elkaar merken.
    houder: { lijst: [] as unknown[], detail: null as unknown },
    muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
  };
});

vi.mock('../../hooks/useExternalMusicians', () => ({
  useExternalMusicians: () => ({ data: houder.lijst, isLoading: false }),
  useExternalMusician: () => ({ data: houder.detail }),
  useCreateExternalMusician: muteerder,
  useUpdateExternalMusician: muteerder,
  useDeleteExternalMusician: muteerder,
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openMuzikantvenster() {
  const gebruiker = userEvent.setup();
  render(<ExternalMusicians />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: /externalMusicians.addMusician/ }));
  return { gebruiker, venster: await screen.findByRole('dialog') };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  houder.lijst = [];
  houder.detail = null;
});

/** Open het detailvenster van een muzikant zoals een lezer dat doet. */
async function openDetailvenster() {
  houder.lijst = [MUZIKANT];
  houder.detail = MUZIKANT_DETAIL;
  const gebruiker = userEvent.setup();
  render(<ExternalMusicians />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: 'Marieke de Vries' }));
  return await screen.findByRole('dialog');
}

describe('externe muzikanten - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het muzikantvenster op hun labeltekst', async () => {
    const { venster } = await openMuzikantvenster();

    expect(within(venster).getByLabelText(/externalMusicians.firstName/)).toBeRequired();
    expect(within(venster).getByLabelText(/externalMusicians.lastName/)).toBeRequired();
    expect(within(venster).getByLabelText('common.email')).toHaveAttribute('type', 'email');
    expect(within(venster).getByLabelText('common.phone')).toHaveAttribute('type', 'tel');
    expect(within(venster).getByLabelText(/externalMusicians.type/).tagName).toBe('SELECT');
    expect(within(venster).getByLabelText('common.notes').tagName).toBe('TEXTAREA');
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const { gebruiker, venster } = await openMuzikantvenster();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(within(venster).getByText(/externalMusicians.firstName/));
    await gebruiker.keyboard('Marieke');

    expect(within(venster).getByLabelText(/externalMusicians.firstName/)).toHaveValue('Marieke');
  });

  it('geeft de sterren en de instrumentenrijen een groepskop in plaats van een label', async () => {
    const { venster } = await openMuzikantvenster();

    // Een <label> hoort bij één veld. Boven vijf sterknoppen en boven een rij
    // per instrument staat dus een groepskop.
    expect(within(venster).getByRole('group', { name: 'externalMusicians.rating' })).toBeInTheDocument();
    expect(within(venster).getByRole('group', { name: 'externalMusicians.instruments' })).toBeInTheDocument();
  });
});

describe('externe muzikanten - het detailvenster labelt niets, dus staat er geen label', () => {
  it('toont de kopjes zonder er een label van te maken', async () => {
    const venster = await openDetailvenster();

    // Er valt in dit venster niets te bedienen: elke waarde is uitgelezen
    // tekst. Vóór de reparatie stonden hier tien <label>-en die naar niets
    // wezen; nu hoort er geen enkele meer te staan.
    expect(venster.querySelectorAll('label')).toHaveLength(0);

    // De kopjes zelf zijn niet verdwenen - ze zien er hetzelfde uit.
    for (const kopje of [
      'externalMusicians.type',
      'common.status',
      'common.email',
      'common.phone',
      'externalMusicians.rating',
      'externalMusicians.performances',
      'externalMusicians.lastPlayed',
      'externalMusicians.instruments',
      'common.notes',
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
