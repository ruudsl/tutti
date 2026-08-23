/**
 * Het pdf-voorbeeldje: het plaatje van bladzijde één in een lijst met stukken.
 *
 * Het component haalt een pdf op, tekent de eerste bladzijde op een canvas en
 * maakt daar een jpeg van. Geen van die drie stappen bestaat in jsdom: er is
 * geen 2d-context, `toDataURL` is niet ingevuld en pdf.js heeft een werker
 * nodig. Alle drie zijn hieronder weggemockt, langs dezelfde naden als in
 * PdfViewer.bediening.test.tsx: `lib/pdfjs` (die het component zelf al als
 * naad heeft aangelegd) en het canvas-prototype.
 *
 * WAT DIT WEL BEWIJST: wanneer er opgehaald wordt en wanneer juist niet, met
 * welke schaal er getekend wordt, wat de gebruiker ziet terwijl het laadt en
 * als het misgaat, hoe de buffer werkt en hoe het voorbeeldje met muis en
 * toetsenbord te bedienen is.
 *
 * WAT NIET: of het plaatje ergens op lijkt. Dat is precies het stuk dat jsdom
 * niet kan, en er wordt hier ook niet omheen gedaan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PdfThumbnail,
  clearThumbnailCache,
  getThumbnailCacheSize,
  removeThumbnailFromCache,
} from '../PdfThumbnail';

const { loadPdfjsMock } = vi.hoisted(() => ({ loadPdfjsMock: vi.fn() }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: loadPdfjsMock }));

// De zichtbaarheid wordt hier met de hand gezet: een IntersectionObserver
// bestaat in jsdom wel als naam maar rapporteert nooit iets, dus zonder deze
// mock zou het voorbeeldje eeuwig op "nog niet in beeld" blijven staan.
const zicht = vi.hoisted(() => ({ zichtbaar: true }));
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoad: () => ({ ref: { current: null }, isVisible: zicht.zichtbaar, hasBeenVisible: zicht.zichtbaar }),
}));

/* ------------------------------------------------------------------ */
/* De namaak-pdf                                                       */
/* ------------------------------------------------------------------ */

let getDocumentMock: ReturnType<typeof vi.fn>;
let getPageMock: ReturnType<typeof vi.fn>;
let vernietigd: ReturnType<typeof vi.fn>;
let getViewportMock: ReturnType<typeof vi.fn>;

/** Een document waarvan bladzijde één 600 bij 800 punten groot is. */
function geefDocument() {
  getViewportMock = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }));
  const bladzijde = { getViewport: getViewportMock, render: vi.fn(() => ({ promise: Promise.resolve() })) };
  vernietigd = vi.fn();
  getPageMock = vi.fn(async () => bladzijde);
  getDocumentMock = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 4, getPage: getPageMock, loadingTask: { destroy: vernietigd } }),
  }));
  loadPdfjsMock.mockResolvedValue({ getDocument: getDocumentMock });
  return { bladzijde };
}

/** Elk getekend voorbeeldje krijgt een eigen adres, zodat ze uit elkaar te houden zijn. */
let tekening = 0;
let laatsteCanvas: { width: number; height: number } | null = null;

beforeAll(() => {
  // useDarkMode vraagt de systeemvoorkeur op; jsdom kent `matchMedia` niet.
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

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = vi.fn(function (this: HTMLCanvasElement) {
    laatsteCanvas = { width: this.width, height: this.height };
    tekening += 1;
    return `data:image/jpeg;base64,tekening-${tekening}`;
  }) as unknown as HTMLCanvasElement['toDataURL'];
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearThumbnailCache();
  zicht.zichtbaar = true;
  tekening = 0;
  laatsteCanvas = null;
  geefDocument();
  localStorage.clear();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Wacht tot het plaatje in beeld staat en geef het terug. */
async function wachtOpPlaatje(alt = 'PDF voorbeeld'): Promise<HTMLImageElement> {
  return (await screen.findByAltText(alt)) as HTMLImageElement;
}

/* ------------------------------------------------------------------ */
/* Laden                                                               */
/* ------------------------------------------------------------------ */

describe('pdf-voorbeeldje - laden', () => {
  it('haalt niets op zolang het voorbeeldje nog niet in beeld staat', async () => {
    zicht.zichtbaar = false;

    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    // Wel alvast een aanduiding, geen netwerkverkeer.
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadPdfjsMock).not.toHaveBeenCalled();
  });

  it('haalt de pdf op zodra het voorbeeldje in beeld schuift', async () => {
    zicht.zichtbaar = false;
    const { rerender } = render(<PdfThumbnail src="/api/files/partituur.pdf" />);
    expect(fetchMock).not.toHaveBeenCalled();

    zicht.zichtbaar = true;
    // Het component is `memo`'d: met precies dezelfde eigenschappen tekent
    // React het niet opnieuw en wordt de nieuwe zichtbaarheid nooit gelezen.
    // In het echt komt die hertekening van de waarnemer zelf.
    rerender(<PdfThumbnail src="/api/files/partituur.pdf" className="in-beeld" />);

    await wachtOpPlaatje();
    expect(fetchMock).toHaveBeenCalledWith('/api/files/partituur.pdf', expect.anything());
  });

  it('tekent de eerste bladzijde en toont die als plaatje', async () => {
    render(<PdfThumbnail src="/api/files/partituur.pdf" alt="Voorblad" />);

    const plaatje = await wachtOpPlaatje('Voorblad');
    expect(plaatje).toHaveAttribute('src', 'data:image/jpeg;base64,tekening-1');
    expect(getPageMock).toHaveBeenCalledWith(1);
    // De aanduiding is weg zodra het plaatje er is.
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
  });

  it('schaalt de bladzijde naar de gevraagde breedte', async () => {
    // De bladzijde is 600 punten breed; bij 150 pixels is dat schaal 0,25.
    render(<PdfThumbnail src="/api/files/partituur.pdf" width={150} />);

    await wachtOpPlaatje();
    expect(getViewportMock).toHaveBeenLastCalledWith({ scale: 0.25 });
    expect(laatsteCanvas).toEqual({ width: 150, height: 200 });
  });

  it('stuurt het toegangsbewijs mee als er een is', async () => {
    localStorage.setItem('token', 'abc123');

    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    await wachtOpPlaatje();
    expect(fetchMock).toHaveBeenCalledWith('/api/files/partituur.pdf', {
      headers: { Authorization: 'Bearer abc123' },
    });
  });

  it('vraagt zonder toegangsbewijs gewoon zonder kop', async () => {
    render(<PdfThumbnail src="/api/files/openbaar.pdf" />);

    await wachtOpPlaatje();
    expect(fetchMock).toHaveBeenCalledWith('/api/files/openbaar.pdf', { headers: {} });
  });

  it('leest een gekozen bestand rechtstreeks in plaats van het op te halen', async () => {
    const bestand = new File(['%PDF-1.4'], 'nieuw.pdf', { type: 'application/pdf' });
    if (typeof bestand.arrayBuffer !== 'function') {
      Object.defineProperty(bestand, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
    }

    render(<PdfThumbnail src={bestand} />);

    await wachtOpPlaatje();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.anything() }));
  });

  it('ruimt het pdf-document op zodra het plaatje klaar is', async () => {
    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    await wachtOpPlaatje();
    expect(vernietigd).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Als het misgaat                                                     */
/* ------------------------------------------------------------------ */

describe('pdf-voorbeeldje - als het misgaat', () => {
  it('meldt het als de server het bestand niet geeft', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) });

    render(<PdfThumbnail src="/api/files/verboden.pdf" />);

    expect(await screen.findByText('Laden mislukt')).toBeInTheDocument();
    expect(screen.queryByAltText('PDF voorbeeld')).not.toBeInTheDocument();
  });

  it('meldt het als de pdf zelf stuk is', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('kapotte pdf')) });

    render(<PdfThumbnail src="/api/files/stuk.pdf" />);

    expect(await screen.findByText('Laden mislukt')).toBeInTheDocument();
  });

  it('meldt het als pdf.js zelf niet geladen kan worden', async () => {
    loadPdfjsMock.mockRejectedValue(new Error('geen verbinding'));

    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    expect(await screen.findByText('Laden mislukt')).toBeInTheDocument();
  });

  it('bewaart een mislukking niet in de buffer', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('kapotte pdf')) });

    render(<PdfThumbnail src="/api/files/stuk.pdf" />);
    await screen.findByText('Laden mislukt');

    expect(getThumbnailCacheSize()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* De buffer                                                           */
/* ------------------------------------------------------------------ */

describe('pdf-voorbeeldje - buffer', () => {
  it('tekent hetzelfde bestand geen tweede keer', async () => {
    const { unmount } = render(<PdfThumbnail src="/api/files/partituur.pdf" />);
    await wachtOpPlaatje();
    expect(loadPdfjsMock).toHaveBeenCalledTimes(1);
    unmount();

    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    const plaatje = await wachtOpPlaatje();
    // Meteen het bewaarde plaatje, zonder er nog eens voor het net op te gaan.
    expect(plaatje).toHaveAttribute('src', 'data:image/jpeg;base64,tekening-1');
    expect(loadPdfjsMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('houdt bestanden met dezelfde naam maar andere inhoud uit elkaar', async () => {
    const oud = new File(['een'], 'partituur.pdf', { type: 'application/pdf' });
    Object.defineProperty(oud, 'size', { value: 100 });
    Object.defineProperty(oud, 'lastModified', { value: 1 });
    Object.defineProperty(oud, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
    const nieuw = new File(['twee'], 'partituur.pdf', { type: 'application/pdf' });
    Object.defineProperty(nieuw, 'size', { value: 200 });
    Object.defineProperty(nieuw, 'lastModified', { value: 2 });
    Object.defineProperty(nieuw, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });

    const { unmount } = render(<PdfThumbnail src={oud} />);
    await wachtOpPlaatje();
    unmount();

    render(<PdfThumbnail src={nieuw} />);

    await waitFor(() => expect(getThumbnailCacheSize()).toBe(2));
  });

  it('kan een bestand uit de buffer gooien, zodat een vervangen pdf opnieuw getekend wordt', async () => {
    const { unmount } = render(<PdfThumbnail src="/api/files/partituur.pdf" />);
    await wachtOpPlaatje();
    unmount();

    removeThumbnailFromCache('/api/files/partituur.pdf');
    expect(getThumbnailCacheSize()).toBe(0);

    render(<PdfThumbnail src="/api/files/partituur.pdf" />);

    const plaatje = await screen.findByAltText('PDF voorbeeld');
    expect(plaatje).toHaveAttribute('src', 'data:image/jpeg;base64,tekening-2');
  });

  /**
   * BEWIJS - een vervangen bladmuziekbestand.
   *
   * Het teken-effect keek alleen naar `loadState === 'idle'`. Stond het
   * voorbeeldje eenmaal op 'loaded', dan gebeurde er bij een nieuwe `src`
   * niets meer: de gebruiker keek naar het voorblad van het oude bestand,
   * terwijl eronder de naam van het nieuwe stond. Dat treft precies het
   * moment waarop het misverstand het duurst is - iemand vervangt de partij
   * door een nieuwe versie en krijgt te zien dat er niets veranderd is.
   *
   * De reparatie: bij een andere bron gaat het voorbeeldje terug naar 'idle',
   * waarna het teken-effect gewoon zijn werk doet.
   *
   * Op de oude code is deze test rood: het plaatje bleef op 'tekening-1'
   * staan. Nagekeken door PdfThumbnail.tsx op HEAD terug te zetten en deze
   * test te draaien.
   */
  it('tekent opnieuw als het voorbeeldje een ander bestand moet tonen', async () => {
    const { rerender } = render(<PdfThumbnail src="/api/files/eerste.pdf" />);
    expect(await wachtOpPlaatje()).toHaveAttribute('src', 'data:image/jpeg;base64,tekening-1');

    rerender(<PdfThumbnail src="/api/files/tweede.pdf" />);

    await waitFor(() =>
      expect(screen.getByAltText('PDF voorbeeld')).toHaveAttribute('src', 'data:image/jpeg;base64,tekening-2'),
    );
    expect(fetchMock).toHaveBeenLastCalledWith('/api/files/tweede.pdf', expect.anything());
  });

  it('tekent niet opnieuw als alleen de omgeving verandert', async () => {
    const { rerender } = render(<PdfThumbnail src="/api/files/partituur.pdf" />);
    await wachtOpPlaatje();

    rerender(<PdfThumbnail src="/api/files/partituur.pdf" className="groot" />);

    await waitFor(() => expect(screen.getByAltText('PDF voorbeeld')).toBeInTheDocument());
    expect(loadPdfjsMock).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* Bedienen                                                            */
/* ------------------------------------------------------------------ */

describe('pdf-voorbeeldje - bedienen', () => {
  it('is een knop met een uitleg als er iets te openen valt', async () => {
    const openen = vi.fn();
    const gebruiker = userEvent.setup();
    render(<PdfThumbnail src="/api/files/partituur.pdf" alt="Voorblad" onClick={openen} />);

    const knop = screen.getByRole('button', { name: 'Voorblad - Klik om te openen' });
    await gebruiker.click(knop);

    expect(openen).toHaveBeenCalledTimes(1);
  });

  it('is met het toetsenbord te openen', async () => {
    const openen = vi.fn();
    const gebruiker = userEvent.setup();
    render(<PdfThumbnail src="/api/files/partituur.pdf" onClick={openen} />);

    await gebruiker.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await gebruiker.keyboard('{Enter}');
    await gebruiker.keyboard(' ');

    expect(openen).toHaveBeenCalledTimes(2);
  });

  it('is geen knop als er niets te openen valt', async () => {
    render(<PdfThumbnail src="/api/files/partituur.pdf" alt="Voorblad" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const doos = document.querySelector('.pdf-thumbnail') as HTMLElement;
    expect(doos).toHaveAttribute('aria-label', 'Voorblad');
    expect(doos).not.toHaveAttribute('tabindex');
  });

  it('laat bij het zweven zien dat er iets te openen valt', async () => {
    const gebruiker = userEvent.setup();
    const { container } = render(<PdfThumbnail src="/api/files/partituur.pdf" onClick={vi.fn()} />);
    await wachtOpPlaatje();

    const doos = container.querySelector('.pdf-thumbnail') as HTMLElement;
    const sluier = doos.querySelector<HTMLElement>('div[aria-hidden="true"]:last-of-type');
    expect(sluier?.style.opacity).toBe('0');

    await gebruiker.hover(doos);
    expect(sluier?.style.opacity).toBe('1');

    await gebruiker.unhover(doos);
    expect(sluier?.style.opacity).toBe('0');
  });

  it('laat de sluier weg als daarom gevraagd is', async () => {
    const gebruiker = userEvent.setup();
    const { container } = render(
      <PdfThumbnail src="/api/files/partituur.pdf" onClick={vi.fn()} showHoverOverlay={false} />,
    );
    await wachtOpPlaatje();

    const doos = container.querySelector('.pdf-thumbnail') as HTMLElement;
    await gebruiker.hover(doos);

    // Alleen het plaatje, geen sluier eroverheen.
    expect(doos.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(0);
  });
});
