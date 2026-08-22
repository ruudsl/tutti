/**
 * De formulierlabels van vier muziekschermen horen bij hun veld - en de koppen
 * die niets labelen zijn geen `<label>` meer.
 *
 * Op alle vier stond het label lós naast het veld in dezelfde `.form-group`,
 * zonder `htmlFor` en zonder `id`. Een schermlezer kondigde dan "bewerkbaar
 * veld" aan zonder te zeggen wat erin moest, en klikken op het label zette de
 * aanwijzer nergens.
 *
 * `getByLabelText` is de kern van deze tests: die vindt een veld alleen als de
 * koppeling er echt is. Zoeken via de omhullende `.form-group` zou ook op de
 * kapotte code slagen en bewijst niets.
 *
 * Twee gevallen in het bewerkvenster van de titels labelen niets:
 *
 *  - Boven de mp3 staat óf een `<audio>`, óf een bijlagestrook, óf een
 *    verborgen bestandsveld achter een knop. Geen van drieën is een bedienbaar
 *    veld om een label aan te hangen.
 *  - De genres zijn een groep aankruisvakjes die elk al hun eigen label dragen.
 *
 * Allebei zijn het nu een `<span className="form-label">`; de genregroep krijgt
 * bovendien een naam via `role="group"` en `aria-labelledby`. De tests daarop
 * kijken dat er géén `<label>` meer staat: een `<label>` zonder `htmlFor` is
 * een lege belofte, en een `htmlFor` die nergens naar wijst is nog slechter.
 *
 * De muzieklijst op de uploadpagina is met de hand gekoppeld: onder dat label
 * staat óf een nieuw-veld met twee knoppen, óf een keuzelijst met een knop.
 * `FormField` kloont maar één kind en past daar dus niet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef } from 'react';
import type { ReactElement } from 'react';

import Genres from '../Genres';
import ImslpBrowser from '../ImslpBrowser';
import Upload from '../Upload';
import { TitleMetaModal } from '../MusicTitles/TitleMetaModal';
import { initialState } from '../MusicTitles/musicTitlesReducer';
import type { MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/StreamingLinks', () => ({
  StreamingLinks: () => <div data-testid="streamingverwijzingen" />,
}));

vi.mock('../MusicTitles/MusicaInfoPanel', () => ({
  MusicaInfoPanel: () => <div data-testid="musicainfo" />,
}));

vi.mock('../../components/FileDropzone', () => ({
  FileDropzone: () => <div data-testid="bestandsvak" />,
}));

vi.mock('../../components/CloudFilePicker', () => ({
  CloudFilePicker: () => <div data-testid="wolkkiezer" />,
}));

vi.mock('../../components/ImslpSearch', () => ({
  ImslpSearch: () => <div data-testid="imslp-zoeker" />,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'geb-1', role: 'admin' } }),
}));

const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useGenres', () => ({
  useGenres: () => ({ data: [{ id: 'gen-1', name: 'Marsen' }], isLoading: false }),
  useCreateGenre: muteerder,
  useUpdateGenre: muteerder,
  useDeleteGenre: muteerder,
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }], isLoading: false }),
}));

vi.mock('../../hooks/useMusicLists', () => ({
  useMusicLists: () => ({ data: [{ id: 'lij-1', name: 'Najaar 2026' }], isLoading: false }),
  useCreateMusicList: muteerder,
}));

/** Toon een pagina met een eigen queryclient eromheen. */
function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('genrepagina - labels gekoppeld aan hun veld', () => {
  it('vindt het naamveld in het toevoegvenster op zijn labeltekst', async () => {
    const gebruiker = toon(<Genres />);

    await gebruiker.click(screen.getByRole('button', { name: /genres\.newGenre/ }));
    expect(await screen.findByLabelText('genres.name')).toHaveAttribute('type', 'text');
  });

  it('zet de aanwijzer in het naamveld als je op het label klikt', async () => {
    const gebruiker = toon(<Genres />);

    await gebruiker.click(screen.getByRole('button', { name: /genres\.newGenre/ }));
    await gebruiker.click(await screen.findByText('genres.name'));
    expect(screen.getByLabelText('genres.name')).toHaveFocus();
  });
});

describe('imslp-bladermuur - labels gekoppeld aan hun veld', () => {
  it('vindt titel en componist op hun labeltekst', () => {
    toon(<ImslpBrowser />);

    expect(screen.getByLabelText('imslp.workTitle')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('imslp.composer')).toHaveAttribute('type', 'text');
  });
});

describe('uploadpagina - labels gekoppeld aan hun veld', () => {
  it('vindt orkest en muzieklijst op hun labeltekst', () => {
    toon(<Upload />);

    expect(screen.getByLabelText('upload.orchestra').tagName).toBe('SELECT');
    expect(screen.getByLabelText('upload.musicList').tagName).toBe('SELECT');
  });

  it('houdt het label bij het nieuwe-lijstveld als dat de keuzelijst vervangt', async () => {
    // Met de hand gekoppeld: er staat altijd precies één van de twee op het
    // scherm, en allebei dragen ze hetzelfde id.
    const gebruiker = toon(<Upload />);

    await gebruiker.selectOptions(screen.getByLabelText('upload.orchestra'), 'ork-1');
    await gebruiker.click(screen.getByRole('button', { name: /upload\.newList/ }));

    expect(await screen.findByLabelText('upload.musicList')).toHaveAttribute('type', 'text');
  });
});

describe('titelbewerkvenster - koppen die niets labelen', () => {
  const titel = { id: 'tit-1', title: 'Also sprach Zarathustra' } as MusicTitle;

  /** Toon het bewerkvenster met één genre om aan te kruisen. */
  function toonVenster() {
    render(
      <TitleMetaModal
        editingTitle={titel}
        state={{ ...initialState, editingTitle: titel }}
        genres={[{ id: 'gen-1', name: 'Marsen' } as never]}
        dispatch={() => {}}
        mp3InputRef={createRef<HTMLInputElement>() as never}
        onSubmit={() => {}}
        onSearchMusicaInfo={() => {}}
        onLoadMusicaInfoDetail={() => {}}
        onApplyMusicaInfoDetail={() => {}}
        onFetchYouTube={() => {}}
        onMp3Upload={() => {}}
        onMp3Delete={() => {}}
        onToggleGenre={() => {}}
      />,
    );
  }

  it('zet boven de mp3 een bijschrift en geen label', () => {
    // Onder deze kop staat geen bedienbaar veld maar een verborgen
    // bestandsveld achter een knop. Een <label> zou naar niets wijzen.
    toonVenster();

    const kop = screen.getByText('titles.mp3Preview');
    expect(kop.tagName).toBe('SPAN');
    expect(kop.closest('.form-group')?.querySelector('label')).toBeNull();
  });

  it('zet boven de genres een groepskop en geen label', () => {
    // Elk genre zit al in zijn eigen label; de kop erboven is een groepskop.
    toonVenster();

    const kop = screen.getByText('titles.genres');
    expect(kop.tagName).toBe('SPAN');
    expect(kop.closest('.form-group')?.querySelector('label.form-label')).toBeNull();

    const groep = screen.getByRole('group', { name: 'titles.genres' });
    expect(within(groep).getByText('Marsen')).toBeInTheDocument();
  });
});
