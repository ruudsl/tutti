/**
 * De uploadpagina: kiezen, ontdubbelen, versturen en de meldingen erna.
 *
 * Deze pagina had geen eigen test. Wat er gedekt was kwam van de routetest,
 * die de pagina alleen tekent. Alles wat de pagina eigenlijk doet - een lijst
 * bestanden bijhouden, dubbele namen weren, een ZIP apart versturen en een
 * nieuwe muzieklijst aanmaken zonder het formulier te verlaten - stond nergens
 * vast.
 *
 * De keuzestrook zelf (react-dropzone) is vervangen door een gewoon
 * bestandsveld. Wat hier getest wordt is niet het slepen maar wat de pagina
 * met de gekozen bestanden doet, en dat begint bij `onFilesAccepted`.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Upload from '../Upload';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../components/CloudFilePicker', () => ({
  CloudFilePicker: () => <div data-testid="wolkkiezer" />,
}));

vi.mock('../../components/ImslpSearch', () => ({
  ImslpSearch: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="imslp">
      <button type="button" onClick={onClose}>
        sluit imslp
      </button>
    </div>
  ),
}));

// De keuzestrook van react-dropzone luistert naar sleepgebeurtenissen die in
// jsdom niets voorstellen. Hier staat een gewoon bestandsveld met dezelfde
// terugmelding, zodat de test bestanden aan de pagina kan geven zoals de
// echte strook dat doet.
vi.mock('../../components/FileDropzone', () => ({
  FileDropzone: ({ onFilesAccepted, disabled }: { onFilesAccepted: (b: File[]) => void; disabled?: boolean }) => (
    <input
      type="file"
      multiple
      disabled={disabled}
      aria-label="bestanden kiezen"
      onChange={(e) => onFilesAccepted(Array.from(e.target.files ?? []))}
    />
  ),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const { houder, uploadMusicPieces, uploadMusicPiecesZip, maakLijst } = vi.hoisted(() => ({
  houder: {
    orkestenLaden: false,
    orkesten: [{ id: 'ork-1', name: 'Harmonie' }],
    lijsten: [{ id: 'lijst-1', name: 'Voorjaarsconcert' }],
  },
  uploadMusicPieces: vi.fn(),
  uploadMusicPiecesZip: vi.fn(),
  maakLijst: vi.fn(),
}));

vi.mock('../../api', () => ({ uploadMusicPieces, uploadMusicPiecesZip }));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: houder.orkesten, isLoading: houder.orkestenLaden }),
}));

vi.mock('../../hooks/useMusicLists', () => ({
  useMusicLists: (orkestId?: string) => ({ data: orkestId ? houder.lijsten : [] }),
  useCreateMusicList: () => ({
    mutate: (gegevens: unknown, opties?: { onSuccess?: (r: { id: string }) => void }) => {
      maakLijst(gegevens);
      opties?.onSuccess?.({ id: 'lijst-nieuw' });
    },
    isPending: false,
  }),
}));

import { showSuccess, showError } from '../../utils/toast';

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function pdf(naam: string): File {
  return new File(['inhoud'], naam, { type: 'application/pdf' });
}

async function openPagina() {
  const gebruiker = userEvent.setup();
  render(<Upload />, { wrapper: wikkel });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  houder.orkestenLaden = false;
  houder.orkesten = [{ id: 'ork-1', name: 'Harmonie' }];
  houder.lijsten = [{ id: 'lijst-1', name: 'Voorjaarsconcert' }];
  uploadMusicPieces.mockResolvedValue({ uploaded: [{ id: 'p1' }], errors: [] });
  uploadMusicPiecesZip.mockResolvedValue({ uploaded: [{ id: 'p1' }], errors: [], skipped: [] });
});

describe('uploadpagina - bestanden kiezen', () => {
  it('toont een skelet zolang de orkesten nog niet binnen zijn', () => {
    houder.orkestenLaden = true;
    render(<Upload />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-kaart')).toBeInTheDocument();
    expect(screen.queryByLabelText('bestanden kiezen')).not.toBeInTheDocument();
  });

  it('zet gekozen bestanden in de lijst en telt ze', async () => {
    const gebruiker = await openPagina();

    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('mars.pdf'), pdf('wals.pdf')]);

    expect(screen.getByText('mars.pdf')).toBeInTheDocument();
    expect(screen.getByText('wals.pdf')).toBeInTheDocument();
    expect(screen.getByText(/^2/)).toBeInTheDocument();
  });

  it('neemt een bestand met dezelfde naam niet twee keer op', async () => {
    const gebruiker = await openPagina();
    const veld = screen.getByLabelText('bestanden kiezen');

    await gebruiker.upload(veld, [pdf('mars.pdf')]);
    await gebruiker.upload(veld, [pdf('mars.pdf'), pdf('wals.pdf')]);

    expect(screen.getAllByText('mars.pdf')).toHaveLength(1);
    expect(screen.getByText('wals.pdf')).toBeInTheDocument();
  });

  it('haalt een bestand weer uit de lijst', async () => {
    const gebruiker = await openPagina();
    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('mars.pdf'), pdf('wals.pdf')]);

    // De kruisjes staan in dezelfde volgorde als de bestanden.
    await gebruiker.click(screen.getAllByRole('button', { name: '×' })[0]);

    expect(screen.queryByText('mars.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('wals.pdf')).toBeInTheDocument();
  });

  it('houdt de verstuurknop uit zolang er niets gekozen is', async () => {
    const gebruiker = await openPagina();
    const verstuur = screen.getByRole('button', { name: /upload\.uploadFiles/ });

    expect(verstuur).toBeDisabled();

    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('mars.pdf')]);

    expect(screen.getByRole('button', { name: /upload\.uploadFiles/ })).toBeEnabled();
  });
});

describe('uploadpagina - versturen', () => {
  it('stuurt de gekozen bestanden mee met de gekozen lijst en maakt de lijst leeg', async () => {
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.selectOptions(screen.getByLabelText('upload.musicList'), 'lijst-1');
    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('mars.pdf')]);
    await gebruiker.click(screen.getByRole('button', { name: /upload\.uploadFiles/ }));

    await waitFor(() => expect(uploadMusicPieces).toHaveBeenCalled());
    expect(uploadMusicPieces.mock.calls[0][0].map((b: File) => b.name)).toEqual(['mars.pdf']);
    expect(uploadMusicPieces.mock.calls[0][1]).toBe('lijst-1');

    await waitFor(() => expect(screen.queryByText('mars.pdf')).not.toBeInTheDocument());
    expect(showSuccess).toHaveBeenCalled();
  });

  it('meldt de bestanden die niet doorkwamen bij naam', async () => {
    uploadMusicPieces.mockResolvedValue({ uploaded: [], errors: [{ filename: 'kapot.pdf' }] });
    const gebruiker = await openPagina();

    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('kapot.pdf')]);
    await gebruiker.click(screen.getByRole('button', { name: /upload\.uploadFiles/ }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(vi.mocked(showError).mock.calls[0][0]).toContain('kapot.pdf');
    // Niets gelukt, dus de keuze blijft staan om het opnieuw te proberen.
    expect(screen.getByText('kapot.pdf')).toBeInTheDocument();
  });

  it('meldt een mislukte verzending', async () => {
    uploadMusicPieces.mockRejectedValue(new Error('netwerk stuk'));
    const gebruiker = await openPagina();

    await gebruiker.upload(screen.getByLabelText('bestanden kiezen'), [pdf('mars.pdf')]);
    await gebruiker.click(screen.getByRole('button', { name: /upload\.uploadFiles/ }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
  });
});

describe('uploadpagina - ZIP', () => {
  function zip(): File {
    return new File(['pk'], 'partijen.zip', { type: 'application/zip' });
  }

  it('toont naam en omvang van de gekozen ZIP en verstuurt hem apart', async () => {
    const gebruiker = await openPagina();

    await gebruiker.upload(document.getElementById('zip-upload') as HTMLInputElement, zip());

    expect(screen.getByText(/partijen\.zip/)).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Upload ZIP' }));

    await waitFor(() => expect(uploadMusicPiecesZip).toHaveBeenCalled());
    expect(uploadMusicPiecesZip.mock.calls[0][0].name).toBe('partijen.zip');
    await waitFor(() => expect(screen.queryByText(/partijen\.zip/)).not.toBeInTheDocument());
  });

  it('legt de gekozen ZIP weer weg met het kruisje', async () => {
    const gebruiker = await openPagina();
    await gebruiker.upload(document.getElementById('zip-upload') as HTMLInputElement, zip());

    await gebruiker.click(screen.getByRole('button', { name: '×' }));

    expect(screen.queryByText(/partijen\.zip/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload ZIP' })).not.toBeInTheDocument();
  });

  it('meldt overgeslagen bestanden uit de ZIP', async () => {
    uploadMusicPiecesZip.mockResolvedValue({ uploaded: [], errors: [], skipped: ['plaatje.png'] });
    const gebruiker = await openPagina();

    await gebruiker.upload(document.getElementById('zip-upload') as HTMLInputElement, zip());
    await gebruiker.click(screen.getByRole('button', { name: 'Upload ZIP' }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(vi.mocked(showError).mock.calls[0][0]).toContain('overgeslagen');
  });
});

describe('uploadpagina - muzieklijst kiezen of maken', () => {
  it('houdt de lijstkeuze dicht tot er een orkest gekozen is', async () => {
    const gebruiker = await openPagina();

    expect(screen.getByLabelText('upload.musicList')).toBeDisabled();
    expect(screen.getByRole('button', { name: /upload\.newList/ })).toBeDisabled();

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');

    expect(screen.getByLabelText('upload.musicList')).toBeEnabled();
  });

  it('maakt een nieuwe lijst en kiest die meteen', async () => {
    const gebruiker = await openPagina();
    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));

    await gebruiker.type(screen.getByLabelText('upload.musicList'), 'Kerstconcert');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(maakLijst).toHaveBeenCalledWith({ name: 'Kerstconcert', orchestraId: 'ork-1' });
    // Het naamveld maakt weer plaats voor de keuzelijst, met de nieuwe lijst erin.
    expect(screen.getByLabelText('upload.musicList').tagName).toBe('SELECT');
  });

  it('maakt de lijst ook met Enter, en stopt met Escape', async () => {
    const gebruiker = await openPagina();
    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');

    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));
    await gebruiker.type(screen.getByLabelText('upload.musicList'), 'Kerstconcert{Enter}');
    expect(maakLijst).toHaveBeenCalledWith({ name: 'Kerstconcert', orchestraId: 'ork-1' });

    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));
    await gebruiker.type(screen.getByLabelText('upload.musicList'), 'Halve naam{Escape}');
    expect(screen.getByLabelText('upload.musicList').tagName).toBe('SELECT');
  });

  it('maakt geen lijst zonder naam', async () => {
    const gebruiker = await openPagina();
    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));

    await gebruiker.type(screen.getByLabelText('upload.musicList'), '   ');

    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
    expect(maakLijst).not.toHaveBeenCalled();
  });

  it('laat de gekozen lijst los als het orkest verandert', async () => {
    houder.orkesten = [
      { id: 'ork-1', name: 'Harmonie' },
      { id: 'ork-2', name: 'Fanfare' },
    ];
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.selectOptions(screen.getByLabelText('upload.musicList'), 'lijst-1');
    expect(screen.getByLabelText('upload.musicList')).toHaveValue('lijst-1');

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-2');

    expect(screen.getByLabelText('upload.musicList')).toHaveValue('');
  });

  it('stopt het naamveld weg als het orkest verandert', async () => {
    houder.orkesten = [
      { id: 'ork-1', name: 'Harmonie' },
      { id: 'ork-2', name: 'Fanfare' },
    ];
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));
    expect(screen.getByLabelText('upload.musicList').tagName).toBe('INPUT');

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-2');

    expect(screen.getByLabelText('upload.musicList').tagName).toBe('SELECT');
  });
});

describe('uploadpagina - zoeken op IMSLP', () => {
  it('opent en sluit het zoekvenster', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'imslp.searchOnImslp' }));
    expect(screen.getByRole('dialog', { name: 'imslp' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'sluit imslp' }));
    expect(screen.queryByRole('dialog', { name: 'imslp' })).not.toBeInTheDocument();
  });
});
