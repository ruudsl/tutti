/**
 * De labels van de partijenpagina horen bij hun veld.
 *
 * In het bewerkvenster stonden label en veld los naast elkaar in dezelfde
 * `form-group`, zonder `htmlFor` en zonder `id`. Voor een schermlezer was dat
 * een naamloos bewerkbaar veld, een klik op het label zette de aanwijzer
 * nergens, en een test kon het veld niet op naam vinden - precies wat deze
 * tests nu wél doen. De velden lopen sinds de ombouw via `FormField`.
 *
 * Twee velden staan hier los van: het YouTube-veld in het bewerkvenster en het
 * instrumentveld in het bulkvenster hebben allebei een hulptekst in dezelfde
 * `form-group` staan. FormField neemt maar één kind aan, dus die twee zijn met
 * de hand gekoppeld - inclusief `aria-describedby` naar de hulptekst. Ook dat
 * wordt hier vastgelegd, want handwerk raakt eerder zoek dan een component.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MusicPieces from '../MusicPieces';
import type { MusicPiece } from '../../types';

vi.mock('../../api');

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

vi.mock('../../components/PdfThumbnail', () => ({
  PdfThumbnail: () => <div data-testid="pdf-miniatuur" />,
}));

vi.mock('../../components/FavoriteButton', () => ({
  FavoriteButton: () => <button type="button">favoriet</button>,
}));

// De partij is van een beheerder, anders staat de potloodknop er niet.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'admin' } }),
}));

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { PARTIJ, muteerder } = vi.hoisted(() => ({
  PARTIJ: {
    id: 'partij-1',
    title: 'Also sprach Zarathustra',
    arranger: 'De Haske',
    instrumentId: 'inst-1',
    instrumentName: 'Trompet',
    tuning: 'Bb',
    groupNumber: '1',
    youtubeUrl: null,
    originalFilename: 'zarathustra.pdf',
  } as unknown as MusicPiece,
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useMusicPieces', () => ({
  useMusicPiecesPaginated: () => ({
    data: { data: [PARTIJ], total: 1, page: 1, pageSize: 50, totalPages: 1 },
    isLoading: false,
  }),
  useUpdateMusicPiece: muteerder,
  useDeleteMusicPiece: muteerder,
  useDeleteMusicPiecesBulk: muteerder,
  useBulkUpdatePieces: muteerder,
  useRefreshInstrumentLinks: muteerder,
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet' }], isLoading: false }),
}));

vi.mock('../../hooks/useMusicLists', () => ({
  useMyMusicLists: () => ({ data: [{ id: 'lijst-1', name: 'Voorjaarsconcert' }] }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openBewerkvenster() {
  const gebruiker = userEvent.setup();
  render(<MusicPieces />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: `common.edit: ${PARTIJ.title}` }));
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // jsdom kent geen matchMedia; het sorteermenu op deze pagina vraagt er wel om.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
});

describe('partijenpagina - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het bewerkvenster op hun labeltekst', async () => {
    await openBewerkvenster();

    expect(screen.getByLabelText('musicPieces.edit.pieceTitle')).toHaveValue(PARTIJ.title);
    expect(screen.getByLabelText('musicPieces.edit.arranger')).toHaveValue(PARTIJ.arranger);
    expect(screen.getByLabelText('musicPieces.edit.tuning')).toHaveValue(PARTIJ.tuning);
    expect(screen.getByLabelText('musicPieces.edit.groupNumber')).toHaveValue(PARTIJ.groupNumber);
    expect(screen.getByLabelText('musicPieces.edit.instrument').tagName).toBe('SELECT');
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const gebruiker = await openBewerkvenster();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('musicPieces.edit.tuning'));
    await gebruiker.keyboard('Es');

    expect(screen.getByLabelText('musicPieces.edit.tuning')).toHaveValue('BbEs');
  });

  it('koppelt het YouTube-veld met de hand, mét verwijzing naar de hulptekst', async () => {
    await openBewerkvenster();

    const veld = screen.getByLabelText('musicPieces.edit.youtubeUrl');
    expect(veld).toHaveAttribute('id', 'piece-youtube-url');
    expect(veld).toHaveAccessibleDescription('musicPieces.edit.youtubeNote');
  });

  it('koppelt het instrumentveld in het bulkvenster met de hand', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicPieces />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('checkbox', { name: `common.select ${PARTIJ.title}` }));
    await gebruiker.click(screen.getByRole('button', { name: /bulk\.title/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'bulk.changeInstrument' }));

    const veld = screen.getByLabelText('musicPieces.edit.instrument');
    expect(veld.tagName).toBe('SELECT');
    expect(veld).toHaveAccessibleDescription('bulk.instrumentHelp');
  });
});
