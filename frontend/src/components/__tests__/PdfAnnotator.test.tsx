/**
 * De tekenlaag over een bladzijde: PdfAnnotation/index.tsx.
 *
 * Dit is het onderdeel dat de gereedschapsbalk en het tekendoek bij elkaar
 * houdt. Het haalt de aantekeningen van de bladzijde op, bewaart nieuwe
 * aantekeningen offline, en houdt de stapels bij voor ongedaan maken en
 * opnieuw.
 *
 * WAT ER WEGGEMOCKT IS, EN WAAROM.
 *
 * - Het tekendoek. Dat heeft zijn eigen tests (AnnotationCanvas.test.tsx) en
 *   heeft een namaakcanvas nodig om überhaupt te lopen. Hier staat er een
 *   schil voor in de plaats met twee knoppen: "teken iets" en "gum de eerste
 *   weg". Zo is van buitenaf te sturen wat het doek naar boven meldt, en dat
 *   is precies waar dit bestand over gaat.
 * - De server en de offline opslag. Allebei naden die het component zelf al
 *   heeft.
 *
 * De gereedschapsbalk is met opzet NIET weggemockt: ongedaan maken, opnieuw
 * en wissen zijn knoppen die de gebruiker indrukt, en dan wil je ze ook echt
 * indrukken.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfAnnotator } from '../PdfAnnotation';
import type { Annotation, AnnotationCanvasProps } from '../PdfAnnotation/types';

const { apiGet, saveOffline, getOffline } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  saveOffline: vi.fn(),
  getOffline: vi.fn(),
}));

vi.mock('../../api/client', () => ({ default: { get: apiGet } }));
vi.mock('../../lib/offlineDb', () => ({
  saveAnnotationOffline: saveOffline,
  getAnnotationsForPiece: getOffline,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De schil om het tekendoek: laat zien wat erop staat en kan er iets bij doen
// of iets weghalen.
vi.mock('../PdfAnnotation/AnnotationCanvas', () => {
  const Doek = ({ annotations, onAnnotationAdd, onAnnotationDelete, width, height, scale }: AnnotationCanvasProps) => (
    <div data-testid="doek" data-breedte={width} data-hoogte={height} data-schaal={scale}>
      <span data-testid="opdoek">{annotations.map((a) => a.color).join(',') || 'leeg'}</span>
      <button
        onClick={() =>
          onAnnotationAdd({
            musicPieceId: 'stuk-1',
            pageNumber: 3,
            annotationType: 'freehand',
            data: { points: [{ x: 1, y: 2 }], color: '#DC2626', width: 2, opacity: 1 },
            color: `#haal${annotations.length + 1}`,
            strokeWidth: 2,
            opacity: 1,
            isShared: false,
          })
        }
      >
        teken iets
      </button>
      <button onClick={() => annotations[0] && onAnnotationDelete(annotations[0].id)}>gum de eerste weg</button>
    </div>
  );
  return { default: Doek, AnnotationCanvas: Doek };
});

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

/** Een aantekening zoals de server hem teruggeeft. */
function vanServer(id: string, kleur: string, dataAlsTekst = false): Annotation {
  const data = { points: [{ x: 1, y: 1 }], color: kleur, width: 2, opacity: 1 };
  return {
    id,
    musicPieceId: 'stuk-1',
    pageNumber: 3,
    annotationType: 'freehand',
    data: (dataAlsTekst ? JSON.stringify(data) : data) as Annotation['data'],
    color: kleur,
    strokeWidth: 2,
    opacity: 1,
    isShared: false,
    createdAt: 'toen',
    updatedAt: 'toen',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: [] });
  getOffline.mockResolvedValue([]);
  saveOffline.mockResolvedValue(undefined);
  localStorage.clear();
});

/** Toon de tekenlaag en wacht tot het laden voorbij is. */
async function toonLaag(props: Partial<React.ComponentProps<typeof PdfAnnotator>> = {}) {
  const resultaat = render(
    <PdfAnnotator musicPieceId="stuk-1" pageNumber={3} pageWidth={600} pageHeight={800} scale={1} {...props} />,
  );
  await waitFor(() => expect(screen.queryByText('Annotaties laden...')).not.toBeInTheDocument());
  return resultaat;
}

/** Wat er op het doek staat: de kleuren van de aantekeningen. */
function opDoek(): string {
  return screen.getByTestId('opdoek').textContent ?? '';
}

/* ------------------------------------------------------------------ */
/* Laden                                                               */
/* ------------------------------------------------------------------ */

describe('tekenlaag - laden', () => {
  it('meldt dat de aantekeningen geladen worden en toont daarna het doek', async () => {
    render(<PdfAnnotator musicPieceId="stuk-1" pageNumber={3} pageWidth={600} pageHeight={800} scale={1} />);

    expect(screen.getByText('Annotaties laden...')).toBeInTheDocument();
    // Zolang er geladen wordt is er niets te tekenen en niets te kiezen.
    expect(screen.queryByTestId('doek')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('doek')).toBeInTheDocument());
    expect(screen.getByText('annotationToolbar.title')).toBeInTheDocument();
  });

  it('haalt de aantekeningen van deze bladzijde op en zet ze op het doek', async () => {
    apiGet.mockImplementation(async (pad: string) =>
      pad === '/annotations/stuk-1/3' ? { data: [vanServer('a1', '#111111'), vanServer('a2', '#222222')] } : null,
    );

    await toonLaag();

    expect(apiGet).toHaveBeenCalledWith('/annotations/stuk-1/3');
    expect(opDoek()).toBe('#111111,#222222');
  });

  it('pakt de tekengegevens uit als de server ze als tekst opstuurt', async () => {
    apiGet.mockImplementation(async (pad: string) =>
      pad === '/annotations/stuk-1/3' ? { data: [vanServer('a1', '#111111', true)] } : null,
    );

    await toonLaag();

    // Het doek krijgt een object, geen jsonreeks: anders valt er niets te tekenen.
    expect(opDoek()).toBe('#111111');
  });

  it('valt terug op de offline opslag als de server niet bereikbaar is', async () => {
    apiGet.mockRejectedValue(new Error('geen verbinding'));
    getOffline.mockResolvedValue([
      {
        id: 'offline-1',
        musicPieceId: 'stuk-1',
        pageNumber: 3,
        annotationType: 'freehand',
        data: JSON.stringify({ points: [], color: '#999999', width: 2, opacity: 1 }),
        color: '#999999',
        strokeWidth: 2,
        opacity: 1,
        isShared: false,
        lastModified: 'gisteren',
      },
    ]);

    await toonLaag();

    expect(getOffline).toHaveBeenCalledWith('stuk-1', 3);
    expect(opDoek()).toBe('#999999');
  });

  it('haalt de aantekeningen opnieuw op bij het doorbladeren', async () => {
    apiGet.mockImplementation(async (pad: string) => {
      if (pad === '/annotations/stuk-1/3') return { data: [vanServer('a1', '#111111')] };
      if (pad === '/annotations/stuk-1/4') return { data: [vanServer('b1', '#444444')] };
      return null;
    });

    const { rerender } = await toonLaag();
    expect(opDoek()).toBe('#111111');

    rerender(<PdfAnnotator musicPieceId="stuk-1" pageNumber={4} pageWidth={600} pageHeight={800} scale={1} />);

    await waitFor(() => expect(opDoek()).toBe('#444444'));
    expect(apiGet).toHaveBeenCalledWith('/annotations/stuk-1/4');
  });

  it('gebruikt de stempels van de server als die er zijn', async () => {
    apiGet.mockImplementation(async (pad: string) =>
      pad === '/annotations/stamps'
        ? {
            data: [
              {
                id: 'eigen-1',
                name: 'Omslaan',
                category: 'dynamics',
                svgData: '<text x="15" y="20">V.S.</text>',
                isBuiltin: false,
              },
            ],
          }
        : { data: [] },
    );
    const gebruiker = userEvent.setup();

    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.tools.stamp' }));

    expect(screen.getByTitle('Omslaan')).toBeInTheDocument();
    // De ingebouwde stempels zijn dan vervangen.
    expect(screen.queryByTitle('fff')).not.toBeInTheDocument();
  });

  it('houdt de ingebouwde stempels als de server er geen heeft', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.tools.stamp' }));

    expect(screen.getByTitle('fff')).toBeInTheDocument();
    expect(screen.getByTitle('ppp')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* De laag over de bladzijde                                           */
/* ------------------------------------------------------------------ */

describe('tekenlaag - maat en plek', () => {
  it('legt het doek precies over de bladzijde, ook bij ingezoomd bladeren', async () => {
    const { container } = await toonLaag({ scale: 1.5 });

    const doek = screen.getByTestId('doek');
    // Het doek rekent zelf met de schaal; het krijgt de maat van de bladzijde.
    expect(doek).toHaveAttribute('data-breedte', '600');
    expect(doek).toHaveAttribute('data-hoogte', '800');
    expect(doek).toHaveAttribute('data-schaal', '1.5');

    // De laag eromheen staat wél op de geschaalde maat over de bladzijde heen.
    const laag = container.querySelector('div') as HTMLElement;
    expect(laag.style.width).toBe('900px');
    expect(laag.style.height).toBe('1200px');
  });

  it('klapt de gereedschapsbalk in en weer uit', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();

    expect(screen.getByText('annotationToolbar.title')).toBeInTheDocument();

    await gebruiker.click(screen.getByTitle('Verberg gereedschap'));
    expect(screen.queryByText('annotationToolbar.title')).not.toBeInTheDocument();
    // Het doek blijft staan: je tekent door met het gereedschap dat aanstond.
    expect(screen.getByTestId('doek')).toBeInTheDocument();

    await gebruiker.click(screen.getByTitle('Toon gereedschap'));
    expect(screen.getByText('annotationToolbar.title')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Tekenen en bewaren                                                  */
/* ------------------------------------------------------------------ */

describe('tekenlaag - tekenen en bewaren', () => {
  it('zet een nieuwe haal op het doek en bewaart hem offline', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();

    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));

    expect(opDoek()).toBe('#haal1');
    await waitFor(() => expect(saveOffline).toHaveBeenCalledTimes(1));
    const bewaard = saveOffline.mock.calls[0][0];
    expect(bewaard).toMatchObject({ musicPieceId: 'stuk-1', pageNumber: 3, annotationType: 'freehand' });
    // De tekengegevens gaan als tekst de opslag in.
    expect(typeof bewaard.data).toBe('string');
    expect(JSON.parse(bewaard.data)).toMatchObject({ points: [{ x: 1, y: 2 }] });
    expect(bewaard.id).toEqual(expect.any(String));
  });

  it('laat de haal staan als de offline opslag hem niet aanneemt', async () => {
    const gebruiker = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveOffline.mockRejectedValue(new Error('opslag vol'));
    await toonLaag();

    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));

    // Wat je net getekend hebt hoort niet ineens te verdwijnen.
    await waitFor(() => expect(saveOffline).toHaveBeenCalled());
    expect(opDoek()).toBe('#haal1');
  });

  it('gumt een haal weg', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    expect(opDoek()).toBe('#haal1,#haal2');

    await gebruiker.click(screen.getByRole('button', { name: 'gum de eerste weg' }));

    expect(opDoek()).toBe('#haal2');
  });
});

/* ------------------------------------------------------------------ */
/* Ongedaan maken, opnieuw en wissen                                   */
/* ------------------------------------------------------------------ */

describe('tekenlaag - ongedaan maken', () => {
  it('houdt ongedaan maken uit zolang er niets getekend is', async () => {
    await toonLaag();

    expect(screen.getByRole('button', { name: 'annotationToolbar.undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeDisabled();
  });

  it('maakt een haal ongedaan en zet hem met opnieuw terug', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    expect(opDoek()).toBe('#haal1,#haal2');

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));
    expect(opDoek()).toBe('#haal1');

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));
    expect(opDoek()).toBe('leeg');
    expect(screen.getByRole('button', { name: 'annotationToolbar.undo' })).toBeDisabled();

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.redo' }));
    expect(opDoek()).toBe('#haal1');
    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.redo' }));
    expect(opDoek()).toBe('#haal1,#haal2');
    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeDisabled();
  });

  it('maakt ook het weggummen ongedaan', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    await gebruiker.click(screen.getByRole('button', { name: 'gum de eerste weg' }));
    expect(opDoek()).toBe('leeg');

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));

    expect(opDoek()).toBe('#haal1');
  });

  it('gooit de opnieuw-stapel weg zodra er verder getekend wordt', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));
    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeEnabled();

    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));

    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeDisabled();
  });

  it('wist het hele blad na een bevestiging, en is ook dat ongedaan te maken', async () => {
    const gebruiker = userEvent.setup();
    await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.clearAll' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(opDoek()).toBe('leeg');

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));

    expect(opDoek()).toBe('#haal1,#haal2');
  });

  /**
   * BEWIJS - ongedaan maken haalde de vorige bladzijde terug.
   *
   * De stapels voor ongedaan maken en opnieuw bleven staan bij het
   * doorbladeren, terwijl de aantekeningen zelf per bladzijde opnieuw
   * opgehaald worden. Wie op bladzijde 3 iets tekende, doorbladerde naar 4 en
   * daar op ongedaan maken drukte, kreeg de aantekeningen van bladzijde 3 op
   * bladzijde 4 in beeld - en zijn eigen aantekeningen van bladzijde 4 waren
   * weg. De knop stond na het bladeren ook al aan terwijl er op die bladzijde
   * niets te herstellen viel.
   *
   * De reparatie: bij het laden van een andere bladzijde beginnen de stapels
   * leeg.
   *
   * Op de oude code is deze test rood: de knop stond aan, en indrukken zette
   * '#111111' op bladzijde 4. Nagekeken door PdfAnnotation/index.tsx op HEAD
   * terug te zetten en deze test te draaien.
   */
  it('begint op een nieuwe bladzijde met een lege stapel', async () => {
    const gebruiker = userEvent.setup();
    apiGet.mockImplementation(async (pad: string) => {
      if (pad === '/annotations/stuk-1/3') return { data: [vanServer('a1', '#111111')] };
      if (pad === '/annotations/stuk-1/4') return { data: [vanServer('b1', '#444444')] };
      return null;
    });

    const { rerender } = await toonLaag();
    await gebruiker.click(screen.getByRole('button', { name: 'teken iets' }));
    expect(screen.getByRole('button', { name: 'annotationToolbar.undo' })).toBeEnabled();

    rerender(<PdfAnnotator musicPieceId="stuk-1" pageNumber={4} pageWidth={600} pageHeight={800} scale={1} />);
    await waitFor(() => expect(opDoek()).toBe('#444444'));

    expect(screen.getByRole('button', { name: 'annotationToolbar.undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeDisabled();
  });
});
