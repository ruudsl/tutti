/**
 * De naamvelden van de orkestenpagina horen bij hun label.
 *
 * Vier vensters op deze pagina - orkest toevoegen, orkest bewerken, muzieklijst
 * toevoegen, muzieklijst bewerken - hadden allemaal hetzelfde patroon: een
 * `form-label` met `orchestras.name` erboven en daaronder een los invoerveld,
 * zonder `htmlFor` en zonder `id`. Vier keer dezelfde fout, vier keer een
 * naamloos veld voor een schermlezer.
 *
 * Het zijn alle vier echte formuliervelden met precies één invoerelement
 * eronder, dus ze lopen sinds de ombouw via `components/FormField`. Dat de vier
 * dezelfde labeltekst delen is hier geen probleem: er staat er altijd maar één
 * tegelijk op het scherm.
 *
 * `getByLabelText` is de kern van de test: die vindt een veld alleen als de
 * koppeling er echt is.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Orchestras from '../Orchestras';

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { ORKEST, muteerder } = vi.hoisted(() => ({
  ORKEST: { id: 'ork-1', name: 'Harmonie', memberCount: 12 },
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false }),
}));

vi.mock('../../api', () => ({
  getOrchestra: async () => ({ ...ORKEST, members: [], musicLists: [] }),
  createMusicList: async () => ({}),
  updateMusicList: async () => ({}),
  deleteMusicList: async () => ({}),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [ORKEST], isLoading: false }),
  useCreateOrchestra: muteerder,
  useUpdateOrchestra: muteerder,
  useDeleteOrchestra: muteerder,
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  Skeleton: () => <div data-testid="skelet" />,
  SkeletonListItem: () => <div data-testid="skelet-item" />,
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('orkestenpagina - het naamveld hoort bij zijn label', () => {
  it('vindt het naamveld van het toevoegvenster op zijn labeltekst', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /orchestras\.newOrchestra/ }));

    const veld = screen.getByLabelText('orchestras.name');
    expect(veld).toHaveAttribute('type', 'text');
    expect(veld.id).toBeTruthy();
  });

  it('typt de naam in het veld dat bij het aangeklikte label hoort', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /orchestras\.newOrchestra/ }));

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('orchestras.name'));
    await gebruiker.keyboard('Fanfare');

    expect(screen.getByLabelText('orchestras.name')).toHaveValue('Fanfare');
  });
});
