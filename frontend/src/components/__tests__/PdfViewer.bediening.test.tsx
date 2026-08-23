/**
 * De pdf-lezer: bladeren, zoomen, donkere modus en de bediening eromheen.
 *
 * PdfViewer.tsx was 1.260 regels en nul procent gedekt. Het bestand tekent een
 * pagina op een canvas met pdf.js, en dat is precies het deel dat in jsdom niet
 * bestaat: er is geen opmaak, geen 2d-context en geen werker.
 *
 * DAAROM DEZE OPSTELLING, EN WAT ZE WEL EN NIET BEWIJST.
 *
 * 1. `lib/pdfjs` is weggemockt. Dat is de naad die de component zelf al heeft
 *    aangelegd: hij haalt pdf.js op via `loadPdfjs()` en gebruikt daarna alleen
 *    `getDocument`, `numPages`, `getPage`, `getViewport` en `render`. Een echte
 *    pdf door jsdom halen zou brosse tests opleveren die over pdf.js gaan en
 *    niet over deze component.
 *
 * 2. `getContext('2d')` bestaat niet in jsdom - zonder canvas-pakket geeft het
 *    null terug. De component slaat het tekenen dan stilzwijgend over
 *    (`if (!ctx) return`), en dan zou de halve renderPage nooit lopen. Hier
 *    staat een minimale nep-context; die tekent niets, maar laat de
 *    rekenstappen eromheen wél lopen.
 *
 * 3. jsdom rekent geen afmetingen uit, dus `clientWidth` is overal nul. De
 *    schaalberekening zou dan door nul heen op nul uitkomen en het
 *    tekenoverlaag (dat `canvasDimensions.width > 0` eist) nooit verschijnen.
 *    Daarom krijgt een div hier een vaste maat.
 *
 * Wat hieronder getest wordt is dus de laag om het tekenen heen: welke pagina
 * er opgevraagd wordt, wat de knoppen en toetsen doen, wat de gebruiker te
 * zien krijgt bij een mislukte lading, en hoe de annotatiebalk zich gedraagt.
 * Hoe de pagina er uiteindelijk uitziet, valt buiten bereik van jsdom en wordt
 * hier niet nagebootst.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfViewer } from '../PdfViewer';

const { loadPdfjsMock, getDocumentMock, getAnnotationsMock, createAnnotationMock, deleteAnnotationMock } = vi.hoisted(
  () => ({
    loadPdfjsMock: vi.fn(),
    getDocumentMock: vi.fn(),
    getAnnotationsMock: vi.fn(),
    createAnnotationMock: vi.fn(),
    deleteAnnotationMock: vi.fn(),
  }),
);

vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: loadPdfjsMock }));

vi.mock('../../api', () => ({
  getAnnotations: getAnnotationsMock,
  createAnnotation: createAnnotationMock,
  deleteAnnotation: deleteAnnotationMock,
}));

// De tekenlaag is een eigen component met eigen netwerkverkeer. Hier telt
// alleen wát de lezer eraan doorgeeft: welke pagina, hoe groot en op welke
// schaal.
vi.mock('../PdfAnnotation', () => ({
  PdfAnnotator: ({
    pageNumber,
    pageWidth,
    pageHeight,
    scale,
  }: {
    pageNumber: number;
    pageWidth: number;
    pageHeight: number;
    scale: number;
  }) => (
    <div data-testid="tekenlaag" data-pagina={pageNumber} data-breedte={pageWidth} data-hoogte={pageHeight}>
      schaal {scale}
    </div>
  ),
}));

// De pedaal praat met echte bluetooth-apparaten; die is er niet. De hook wordt
// hier nagebootst zodat de indicator wél verschijnt en de test de knoppen van
// het pedaal kan indrukken - dat is de koppeling die getest wordt.
const pedaalHandelingen: { volgende?: () => void; vorige?: () => void } = {};
vi.mock('../../hooks/useBluetoothPedal', () => ({
  useBluetoothPedal: ({ onPageNext, onPagePrevious }: { onPageNext?: () => void; onPagePrevious?: () => void }) => {
    pedaalHandelingen.volgende = onPageNext;
    pedaalHandelingen.vorige = onPagePrevious;
    return {
      isSupported: true,
      isConnected: true,
      isConnecting: false,
      deviceName: 'AirTurn PED',
      batteryLevel: 80,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  },
  default: () => ({}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties === 'object' ? `${sleutel}(${Object.values(opties).join(',')})` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

/** Een document met een vast aantal pagina's, zoals pdf.js het teruggeeft. */
function nepDocument(aantalPaginas: number) {
  const getPage = vi.fn(async (nummer: number) => {
    // pdf.js weigert een paginanummer buiten het document; dat gedrag hoort
    // erbij, want de lezer rekent dat nummer zelf uit.
    if (nummer < 1 || nummer > aantalPaginas) {
      throw new Error(`Invalid page request ${nummer}`);
    }
    return {
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
      render: () => ({ promise: Promise.resolve() }),
    };
  });
  return { numPages: aantalPaginas, getPage };
}

let document_: ReturnType<typeof nepDocument>;

/** Zet klaar dat `getDocument` dit document teruggeeft. */
function geefDocument(aantalPaginas: number) {
  document_ = nepDocument(aantalPaginas);
  getDocumentMock.mockReturnValue({ promise: Promise.resolve(document_) });
  return document_;
}

beforeAll(() => {
  // Zie punt 2 en 3 van de kop.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];

  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

beforeEach(() => {
  vi.clearAllMocks();
  loadPdfjsMock.mockResolvedValue({ getDocument: getDocumentMock });
  getAnnotationsMock.mockResolvedValue([]);
  geefDocument(3);
});

afterEach(() => {
  vi.useRealTimers();
});

/** De paginateller, bijvoorbeeld "2 / 3". */
function paginateller(): string {
  return screen.getByText(/^\d+ \/ \d+$/, { selector: 'span' }).textContent ?? '';
}

/** Toon de lezer en wacht tot het laadscherm weg is. */
async function toonLezer(props: Partial<React.ComponentProps<typeof PdfViewer>> = {}) {
  const resultaat = render(<PdfViewer url="blob:partituur.pdf" {...props} />);
  await waitFor(() => expect(screen.queryByText('Loading PDF...')).not.toBeInTheDocument());
  return resultaat;
}

describe('pdf-lezer - laden', () => {
  it('toont eerst een laadscherm en daarna de eerste pagina van het document', async () => {
    render(<PdfViewer url="blob:partituur.pdf" />);

    expect(screen.getByText('Loading PDF...')).toBeInTheDocument();

    await waitFor(() => expect(paginateller()).toBe('1 / 3'));
    expect(getDocumentMock).toHaveBeenCalledWith({ url: 'blob:partituur.pdf' });
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(1));
  });

  it('leest een gekozen bestand als gegevens in plaats van als adres', async () => {
    const bestand = new File(['%PDF-1.4'], 'partituur.pdf', { type: 'application/pdf' });
    // jsdom's File kent `arrayBuffer` niet in elke versie; de lezer roept hem
    // wel aan, dus hier staat hij klaar.
    if (typeof bestand.arrayBuffer !== 'function') {
      Object.defineProperty(bestand, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
    }

    await toonLezer({ url: undefined, file: bestand });

    expect(getDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.anything() }));
    expect(getDocumentMock.mock.calls[0][0]).not.toHaveProperty('url');
  });

  it('meldt een mislukte lading in plaats van een leeg scherm', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('kapotte pdf')) });

    render(<PdfViewer url="blob:stuk.pdf" />);

    expect(await screen.findByText('Could not load PDF')).toBeInTheDocument();
    // De bediening hoort er dan niet te staan: er valt niets te bladeren.
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('meldt het ook als er helemaal geen bron is meegegeven', async () => {
    render(<PdfViewer />);

    expect(await screen.findByText('Could not load PDF')).toBeInTheDocument();
    expect(getDocumentMock).not.toHaveBeenCalled();
  });

  /**
   * BEWIJS - een pdf zonder pagina's.
   *
   * `setCurrentPage(Math.min(initialPage, pdf.numPages))` begrensde alleen naar
   * boven. Bij een document met nul pagina's kwam daar paginanummer 0 uit: de
   * gebruiker kreeg "0 / 0" in beeld, de lezer vroeg vervolgens pagina 0 op bij
   * pdf.js (die weigert dat) en het canvas bleef leeg zonder enige melding.
   *
   * Op de oude code is deze test rood: er stond "0 / 0" en de foutmelding
   * ontbrak. Gecontroleerd door PdfViewer.tsx terug te zetten op HEAD en deze
   * test te draaien.
   */
  it('behandelt een pdf zonder pagina´s als een mislukte lading', async () => {
    geefDocument(0);

    render(<PdfViewer url="blob:leeg.pdf" />);

    expect(await screen.findByText('Could not load PDF')).toBeInTheDocument();
    expect(screen.queryByText('0 / 0')).not.toBeInTheDocument();
    // En er wordt geen pagina 0 opgevraagd bij pdf.js.
    expect(document_.getPage).not.toHaveBeenCalled();
  });

  it('begint op de meegegeven pagina', async () => {
    await toonLezer({ initialPage: 2 });

    expect(paginateller()).toBe('2 / 3');
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(2));
  });

  it('houdt een beginpagina buiten het document binnen de perken', async () => {
    // Te hoog: het document heeft er drie.
    const { unmount } = await toonLezer({ initialPage: 9 });
    expect(paginateller()).toBe('3 / 3');
    unmount();

    // Te laag - dit is dezelfde ondergrens als bij het lege document.
    geefDocument(3);
    await toonLezer({ initialPage: 0 });
    expect(paginateller()).toBe('1 / 3');
  });
});

describe('pdf-lezer - bladeren', () => {
  it('bladert vooruit en terug met de knoppen', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    expect(paginateller()).toBe('2 / 3');
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(2));

    await gebruiker.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(paginateller()).toBe('1 / 3');
  });

  it('zet de bladerknop uit aan het begin en aan het eind', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();

    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));

    expect(paginateller()).toBe('3 / 3');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('meldt elke paginawissel aan wie de lezer toont', async () => {
    const gebruiker = userEvent.setup();
    const gemeld = vi.fn();
    await toonLezer({ onPageChange: gemeld });

    expect(gemeld).toHaveBeenCalledWith(1, 3);

    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    expect(gemeld).toHaveBeenLastCalledWith(2, 3);
  });

  it('bladert met de pijltjestoetsen, spatie, page up/down en home/end', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.keyboard('{ArrowRight}');
    expect(paginateller()).toBe('2 / 3');

    await gebruiker.keyboard('{ArrowLeft}');
    expect(paginateller()).toBe('1 / 3');

    await gebruiker.keyboard('{ArrowDown}');
    expect(paginateller()).toBe('2 / 3');

    await gebruiker.keyboard('{ArrowUp}');
    expect(paginateller()).toBe('1 / 3');

    await gebruiker.keyboard(' ');
    expect(paginateller()).toBe('2 / 3');

    await gebruiker.keyboard('{PageDown}');
    expect(paginateller()).toBe('3 / 3');

    await gebruiker.keyboard('{PageUp}');
    expect(paginateller()).toBe('2 / 3');

    await gebruiker.keyboard('{End}');
    expect(paginateller()).toBe('3 / 3');

    await gebruiker.keyboard('{Home}');
    expect(paginateller()).toBe('1 / 3');
  });

  it('bladert niet voorbij de eerste of de laatste pagina', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(paginateller()).toBe('1 / 3');

    await gebruiker.keyboard('{End}{ArrowRight}{ArrowRight}');
    expect(paginateller()).toBe('3 / 3');
  });

  it('vraagt een al getekende pagina niet nog een keer op bij pdf.js', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(1));

    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(2));

    document_.getPage.mockClear();
    await gebruiker.click(screen.getByRole('button', { name: 'Previous page' }));

    // Pagina 1 staat nog in de buffer op dezelfde zoomstand.
    expect(paginateller()).toBe('1 / 3');
    await waitFor(() => expect(paginateller()).toBe('1 / 3'));
    expect(document_.getPage).not.toHaveBeenCalled();
  });

  it('luistert naar het bluetooth-pedaal', async () => {
    await toonLezer({ showPedalIndicator: true });

    expect(screen.getByText('AirTurn PED')).toBeInTheDocument();

    act(() => pedaalHandelingen.volgende?.());
    await waitFor(() => expect(paginateller()).toBe('2 / 3'));

    act(() => pedaalHandelingen.vorige?.());
    await waitFor(() => expect(paginateller()).toBe('1 / 3'));
  });

  it('bladert met een veegbeweging over het blad', async () => {
    const { container } = await toonLezer();
    const blad = container.querySelector('.pdf-viewer') as HTMLElement;

    // Naar links vegen is doorbladeren, zoals bij een boek.
    fireEvent.touchStart(blad, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchMove(blad, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(blad, { changedTouches: [{ clientX: 200, clientY: 200 }] });

    await waitFor(() => expect(paginateller()).toBe('2 / 3'));

    fireEvent.touchStart(blad, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchMove(blad, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(blad, { changedTouches: [{ clientX: 300, clientY: 200 }] });

    await waitFor(() => expect(paginateller()).toBe('1 / 3'));
  });

  it('veegt niet wanneer vegen uitgezet is', async () => {
    const { container } = await toonLezer({ enableSwipe: false });
    const blad = container.querySelector('.pdf-viewer') as HTMLElement;

    fireEvent.touchStart(blad, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchMove(blad, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(blad, { changedTouches: [{ clientX: 200, clientY: 200 }] });

    expect(paginateller()).toBe('1 / 3');
  });

  it('verbergt de paginateller als daarom gevraagd wordt', async () => {
    await toonLezer({ showPageIndicator: false });

    expect(screen.queryByText(/^\d+ \/ \d+$/, { selector: 'span' })).not.toBeInTheDocument();
    // De bladerknoppen blijven wel staan.
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  });
});

describe('pdf-lezer - zoomen', () => {
  it('toont de zoomstand en verandert die met de knoppen', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    expect(screen.getByText('100%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('156%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
  });

  it('komt niet boven de hoogste en niet onder de laagste zoomstand', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer({ maxZoom: 1.5 });

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom out' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Zoom out' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('biedt pas een terugzetknop zodra er ingezoomd is', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Reset zoom' }));

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument();
  });

  it('zoomt ook met de toetsen plus, min en nul', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.keyboard('+');
    expect(screen.getByText('125%')).toBeInTheDocument();

    await gebruiker.keyboard('=');
    expect(screen.getByText('156%')).toBeInTheDocument();

    await gebruiker.keyboard('-');
    expect(screen.getByText('125%')).toBeInTheDocument();

    await gebruiker.keyboard('0');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('tekent de pagina opnieuw op de nieuwe zoomstand', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(1));

    document_.getPage.mockClear();
    await gebruiker.click(screen.getByRole('button', { name: 'Zoom in' }));

    // Dezelfde pagina, maar de buffer geldt alleen voor de vorige zoomstand.
    await waitFor(() => expect(document_.getPage).toHaveBeenCalledWith(1));
  });

  it('laat de zoomknoppen weg als zoomen uitstaat', async () => {
    await toonLezer({ enableZoom: false });

    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
    // De donkeremodusknop hoort er wel te blijven.
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
  });
});

describe('pdf-lezer - donkere modus', () => {
  it('wisselt met de knop en benoemt wat de knop dan doet', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
  });

  it('wisselt ook met de toets i', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer();

    await gebruiker.keyboard('i');
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();

    await gebruiker.keyboard('I');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
  });

  it('begint donker als de aanroeper daarom vraagt', async () => {
    await toonLezer({ darkMode: true });

    expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();
  });

  it('volgt de voorkeur van het systeem als dat gevraagd is', async () => {
    const luisteraars: Array<(e: MediaQueryListEvent) => void> = [];
    const matchMediaOrigineel = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: (_type: string, fn: (e: MediaQueryListEvent) => void) => luisteraars.push(fn),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    try {
      await toonLezer({ autoDarkMode: true });
      expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();

      // Het systeem gaat over op licht; de lezer hoort mee te gaan.
      act(() => luisteraars.forEach((fn) => fn({ matches: false } as MediaQueryListEvent)));
      expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    } finally {
      window.matchMedia = matchMediaOrigineel;
    }
  });
});

describe('pdf-lezer - annotaties', () => {
  const ANNOTATIES = [
    { id: 'a1', pageNumber: 1, content: 'Let op de herhaling', color: '#fbbf24', createdAt: '2026-01-01' },
    { id: 'a2', pageNumber: 2, content: 'Hier zachter', color: '#34d399', createdAt: '2026-01-02' },
  ];

  it('toont geen annotatieknoppen zonder muziekstuk', async () => {
    await toonLezer();

    expect(screen.queryByRole('button', { name: 'annotations.showAnnotations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Teken op bladmuziek' })).not.toBeInTheDocument();
  });

  it('haalt de annotaties op en toont er alleen die van de open pagina', async () => {
    const gebruiker = userEvent.setup();
    getAnnotationsMock.mockResolvedValue(ANNOTATIES);

    await toonLezer({ musicPieceId: 'stuk-1' });
    await waitFor(() => expect(getAnnotationsMock).toHaveBeenCalledWith('stuk-1'));

    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));

    expect(screen.getByText('Let op de herhaling')).toBeInTheDocument();
    expect(screen.queryByText('Hier zachter')).not.toBeInTheDocument();
    expect(screen.getByText('annotations.pageLabel(1)')).toBeInTheDocument();

    // Doorbladeren wisselt de lijst mee.
    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Hier zachter')).toBeInTheDocument();
    expect(screen.queryByText('Let op de herhaling')).not.toBeInTheDocument();
    expect(screen.getByText('annotations.pageLabel(2)')).toBeInTheDocument();
  });

  it('meldt het als de open pagina nog geen annotatie heeft', async () => {
    const gebruiker = userEvent.setup();
    getAnnotationsMock.mockResolvedValue(ANNOTATIES);

    await toonLezer({ musicPieceId: 'stuk-1', initialPage: 3 });
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));

    expect(screen.getByText('annotations.noAnnotations')).toBeInTheDocument();
  });

  it('bewaart een nieuwe annotatie bij de open pagina en meldt dat', async () => {
    const gebruiker = userEvent.setup();
    createAnnotationMock.mockResolvedValue({ id: 'nieuw-1', message: 'ok' });

    await toonLezer({ musicPieceId: 'stuk-1' });
    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));

    const knop = screen.getByRole('button', { name: 'annotations.add' });
    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('annotations.placeholder'), 'Tempo aanhouden');
    await gebruiker.click(screen.getByRole('button', { name: '#34d399' }));
    expect(knop).toBeEnabled();
    await gebruiker.click(knop);

    await waitFor(() =>
      expect(createAnnotationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          musicPieceId: 'stuk-1',
          pageNumber: 2,
          content: 'Tempo aanhouden',
          color: '#34d399',
        }),
      ),
    );

    expect(await screen.findByText('annotations.saved')).toBeInTheDocument();
    expect(screen.getByText('Tempo aanhouden')).toBeInTheDocument();
    // Het invoerveld is leeg voor de volgende opmerking.
    expect(screen.getByPlaceholderText('annotations.placeholder')).toHaveValue('');
  });

  it('gooit een annotatie weg', async () => {
    const gebruiker = userEvent.setup();
    getAnnotationsMock.mockResolvedValue(ANNOTATIES);
    deleteAnnotationMock.mockResolvedValue({ message: 'weg' });

    await toonLezer({ musicPieceId: 'stuk-1' });
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));

    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.delete' }));

    await waitFor(() => expect(deleteAnnotationMock).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByText('Let op de herhaling')).not.toBeInTheDocument());
    expect(screen.getByText('annotations.deleted')).toBeInTheDocument();
  });

  it('houdt de annotatie staan als de server hem niet wil wegdoen', async () => {
    const gebruiker = userEvent.setup();
    getAnnotationsMock.mockResolvedValue(ANNOTATIES);
    deleteAnnotationMock.mockRejectedValue(new Error('serverfout'));

    await toonLezer({ musicPieceId: 'stuk-1' });
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.delete' }));

    await waitFor(() => expect(deleteAnnotationMock).toHaveBeenCalled());
    expect(screen.getByText('Let op de herhaling')).toBeInTheDocument();
  });

  it('gebruikt de meegegeven annotaties in plaats van ze op te halen', async () => {
    const gebruiker = userEvent.setup();

    await toonLezer({
      musicPieceId: 'stuk-1',
      annotations: [{ id: 'e1', pageNumber: 1, content: 'Van buitenaf', color: '#f87171', createdAt: '2026-02-02' }],
    });

    expect(getAnnotationsMock).not.toHaveBeenCalled();
    await gebruiker.click(screen.getByRole('button', { name: 'annotations.showAnnotations' }));
    expect(screen.getByText('Van buitenaf')).toBeInTheDocument();
  });

  it('valt stil terug als de annotaties niet op te halen zijn', async () => {
    const gebruiker = userEvent.setup();
    getAnnotationsMock.mockRejectedValue(new Error('geen verbinding'));

    await toonLezer({ musicPieceId: 'stuk-1' });
    await gebruiker.click(await screen.findByRole('button', { name: 'annotations.showAnnotations' }));

    // Geen foutmelding in beeld: annotaties zijn bijzaak bij het bladeren.
    expect(screen.getByText('annotations.noAnnotations')).toBeInTheDocument();
  });

  it('opent en sluit de annotatiebalk met dezelfde knop', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer({ musicPieceId: 'stuk-1' });

    expect(screen.queryByText('annotations.title')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'annotations.showAnnotations' }));
    expect(screen.getByText('annotations.title')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'annotations.hideAnnotations' }));
    expect(screen.queryByText('annotations.title')).not.toBeInTheDocument();
  });

  it('laat de toetsen met rust terwijl je een annotatie typt', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer({ musicPieceId: 'stuk-1' });
    await gebruiker.click(screen.getByRole('button', { name: 'annotations.showAnnotations' }));

    await gebruiker.click(screen.getByPlaceholderText('annotations.placeholder'));
    await gebruiker.keyboard('d 0 i');

    // Niet doorgebladerd, niet gezoomd, geen tekenmodus, geen donkere modus.
    expect(paginateller()).toBe('1 / 3');
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByTestId('tekenlaag')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('annotations.placeholder')).toHaveValue('d 0 i');
  });
});

describe('pdf-lezer - tekenmodus', () => {
  it('legt de tekenlaag over de open pagina en haalt hem er met Escape weer af', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer({ musicPieceId: 'stuk-1' });

    expect(screen.queryByTestId('tekenlaag')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Teken op bladmuziek' }));
    const laag = await screen.findByTestId('tekenlaag');
    expect(laag).toHaveAttribute('data-pagina', '1');
    expect(laag).toHaveTextContent('schaal 1');
    expect(screen.getByRole('button', { name: 'Stop tekenen' })).toBeInTheDocument();

    await gebruiker.keyboard('{Escape}');
    expect(screen.queryByTestId('tekenlaag')).not.toBeInTheDocument();
  });

  it('wisselt de tekenmodus met de toets d, maar alleen bij een muziekstuk', async () => {
    const gebruiker = userEvent.setup();
    const { unmount } = await toonLezer({ musicPieceId: 'stuk-1' });

    await gebruiker.keyboard('d');
    expect(await screen.findByTestId('tekenlaag')).toBeInTheDocument();
    await gebruiker.keyboard('D');
    expect(screen.queryByTestId('tekenlaag')).not.toBeInTheDocument();
    unmount();

    geefDocument(3);
    await toonLezer();
    await gebruiker.keyboard('d');
    expect(screen.queryByTestId('tekenlaag')).not.toBeInTheDocument();
  });

  it('houdt de tekenlaag bij de pagina waar je op staat', async () => {
    const gebruiker = userEvent.setup();
    await toonLezer({ musicPieceId: 'stuk-1' });

    await gebruiker.click(screen.getByRole('button', { name: 'Teken op bladmuziek' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(screen.getByTestId('tekenlaag')).toHaveAttribute('data-pagina', '2'));
  });
});
