/**
 * Het bladzijdenoverzicht bij het opknippen van een pdf.
 *
 * Dit component staat in het scherm waar een grote pdf in partijen geknipt
 * wordt: het toont alle bladzijden als kleine plaatjes en kleurt de gekozen
 * bereiken. Voor het tekenen gebruikt het pdf.js en een canvas - allebei niet
 * aanwezig in jsdom, allebei hieronder weggemockt langs dezelfde naden als in
 * PdfViewer.bediening.test.tsx.
 *
 * De zichtbaarheid van de bladzijden komt van useLazyLoadMultiple, die aan
 * een IntersectionObserver hangt. Die meldt in jsdom nooit iets, dus wordt
 * hier per test gezegd welke bladzijden in beeld staan. Dat is meteen het
 * interessantste gedrag om vast te leggen: een pdf van tweehonderd bladzijden
 * mag er niet tweehonderd tekenen.
 *
 * NIET GETEST: hoe de plaatjes eruitzien, en het rooster waarin ze staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PdfPagePreview from '../PdfPagePreview';

const { loadPdfjsMock } = vi.hoisted(() => ({ loadPdfjsMock: vi.fn() }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: loadPdfjsMock }));

/** Welke bladzijden staan in beeld? Per test in te stellen. */
const zicht = vi.hoisted(() => ({ inBeeld: (_index: number) => true }));
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoadMultiple: ({ count }: { count: number }) => ({
    getRef: () => () => {},
    visibilityStates: Array.from({ length: count }, (_, i) => zicht.inBeeld(i)),
  }),
}));

/* ------------------------------------------------------------------ */
/* De namaak-pdf                                                       */
/* ------------------------------------------------------------------ */

let getDocumentMock: ReturnType<typeof vi.fn>;
let getPageMock: ReturnType<typeof vi.fn>;
let getViewportMock: ReturnType<typeof vi.fn>;
let vernietigd: ReturnType<typeof vi.fn>;
let tekening = 0;

/** Een document met het gevraagde aantal bladzijden van 600 bij 800 punten. */
function geefDocument(aantalBladzijden: number) {
  getViewportMock = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }));
  vernietigd = vi.fn();
  getPageMock = vi.fn(async () => ({
    getViewport: getViewportMock,
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  }));
  getDocumentMock = vi.fn(() => ({
    promise: Promise.resolve({ numPages: aantalBladzijden, getPage: getPageMock, loadingTask: { destroy: vernietigd } }),
  }));
  loadPdfjsMock.mockResolvedValue({ getDocument: getDocumentMock });
}

/**
 * Het bestand dat de tests gebruiken. Het is met opzet één en hetzelfde
 * object: het laad-effect hangt aan `file`, dus een vers `File` bij elke
 * hertekening zou de hele pdf opnieuw inlezen en de meting over hertekenen
 * waardeloos maken.
 */
let hetBestand: File;

/** Een gekozen bestand, met de `arrayBuffer` die jsdom niet altijd meelevert. */
function bestand(naam = 'symfonie.pdf') {
  const f = new File(['%PDF-1.4'], naam, { type: 'application/pdf' });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => new ArrayBuffer(16) });
  return f;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
    tekening += 1;
    return `data:image/jpeg;base64,tekening-${tekening}`;
  }) as unknown as HTMLCanvasElement['toDataURL'];
});

beforeEach(() => {
  vi.clearAllMocks();
  tekening = 0;
  zicht.inBeeld = () => true;
  hetBestand = bestand();
  geefDocument(4);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Toon het overzicht en wacht tot de bladzijden er staan. */
async function toonOverzicht(props: Partial<React.ComponentProps<typeof PdfPagePreview>> = {}) {
  const resultaat = render(<PdfPagePreview file={hetBestand} {...props} />);
  await waitFor(() => expect(screen.queryByText('PDF wordt geladen...')).not.toBeInTheDocument());
  return resultaat;
}

/** De nummers onder de bladzijden, op volgorde. */
function bladzijdenummers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.pdf-thumbnail')).map((el) =>
    (el.lastElementChild?.textContent ?? '').trim(),
  );
}

/* ------------------------------------------------------------------ */
/* Laden                                                               */
/* ------------------------------------------------------------------ */

describe('bladzijdenoverzicht - laden', () => {
  it('meldt dat de pdf geladen wordt en toont daarna elke bladzijde', async () => {
    const { container } = render(<PdfPagePreview file={hetBestand} />);

    expect(screen.getByText('PDF wordt geladen...')).toBeInTheDocument();

    await waitFor(() => expect(container.querySelectorAll('.pdf-thumbnail')).toHaveLength(4));
    expect(bladzijdenummers(container)).toEqual(['1', '2', '3', '4']);
    expect(screen.queryByText('PDF wordt geladen...')).not.toBeInTheDocument();
  });

  it('tekent elke bladzijde die in beeld staat', async () => {
    await toonOverzicht();

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));
    expect(screen.getByAltText('Pagina 1')).toBeInTheDocument();
    expect(screen.getByAltText('Pagina 4')).toBeInTheDocument();
  });

  it('meldt een mislukte lading in plaats van een leeg rooster', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('kapotte pdf')) });

    render(<PdfPagePreview file={hetBestand} />);

    expect(await screen.findByText('Kon PDF niet laden')).toBeInTheDocument();
    expect(document.querySelectorAll('.pdf-thumbnail')).toHaveLength(0);
  });

  it('meldt het ook als pdf.js zelf niet te laden is', async () => {
    loadPdfjsMock.mockRejectedValue(new Error('geen verbinding'));

    render(<PdfPagePreview file={hetBestand} />);

    expect(await screen.findByText('Kon PDF niet laden')).toBeInTheDocument();
  });

  it('leest een nieuw gekozen bestand opnieuw in', async () => {
    const { rerender } = await toonOverzicht();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));

    geefDocument(2);
    rerender(<PdfPagePreview file={bestand('ouverture.pdf')} />);

    await waitFor(() => expect(document.querySelectorAll('.pdf-thumbnail')).toHaveLength(2));
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
  });

  it('ruimt het pdf-document op als het overzicht weg is', async () => {
    const { unmount } = await toonOverzicht();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));

    unmount();

    expect(vernietigd).toHaveBeenCalled();
  });

  it('slaat een bladzijde over die niet te tekenen is, en houdt de rest', async () => {
    getPageMock.mockImplementation(async (nummer: number) => {
      if (nummer === 2) throw new Error('bladzijde stuk');
      return { getViewport: getViewportMock, render: vi.fn(() => ({ promise: Promise.resolve() })) };
    });

    await toonOverzicht();

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(screen.queryByAltText('Pagina 2')).not.toBeInTheDocument();
    // De bladzijde blijft wel in het rooster staan, met zijn nummer eronder.
    expect(bladzijdenummers(document.body)).toEqual(['1', '2', '3', '4']);
  });
});

/* ------------------------------------------------------------------ */
/* Alleen tekenen wat er te zien is                                    */
/* ------------------------------------------------------------------ */

describe('bladzijdenoverzicht - luie plaatjes', () => {
  it('tekent alleen de bladzijden die in beeld staan', async () => {
    geefDocument(20);
    zicht.inBeeld = (i) => i < 3;

    await toonOverzicht();

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(getPageMock).toHaveBeenCalledWith(1);
    expect(getPageMock).not.toHaveBeenCalledWith(4);
    // De rest staat er wel, als plaatshouder met een draaitol.
    expect(document.querySelectorAll('.pdf-thumbnail')).toHaveLength(20);
    expect(document.querySelectorAll('.spinner').length).toBeGreaterThan(0);
  });

  // WACHT, geen bewijs: dit blijft ook op de oude code groen. Het legt vast
  // dat één ronde langs de zichtbare bladzijden er niet twee van maakt.
  it('tekent elke bladzijde precies één keer', async () => {
    await toonOverzicht();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));

    const opgevraagd = getPageMock.mock.calls.map((c) => c[0]).sort();
    expect(opgevraagd).toEqual([1, 2, 3, 4]);
  });

  /*
   * WACHT, geen bewijs. Dit ziet eruit als een test op een fout, en dat was
   * ook de bedoeling: het teken-effect hangt aan `visibilityStates` én aan
   * `thumbnails` en zet `thumbnails` ook zelf, dus in theorie kan een tweede
   * ronde beginnen terwijl de eerste nog loopt en dezelfde bladzijde nog een
   * keer tekenen. Met echte, meteen slagende beloftes gebeurt dat niet: elke
   * ronde ziet de vorige bladzijde al gezet staan.
   *
   * De eerste opzet van deze test liet wél dubbel werk zien, maar dat kwam
   * doordat de test bij elke hertekening een vers `File`-object meegaf. Het
   * laad-effect hangt aan `file`, dus dan werd de hele pdf opnieuw ingelezen -
   * een fout in de test, niet in het component. Vandaar dat `hetBestand`
   * hierboven één object is.
   *
   * Wat er nu staat is dus geen bewijs van een reparatie maar een ratel: gaat
   * er ooit iets schuiven in de volgorde van de effecten, dan valt dit om.
   */
  it('tekent een bladzijde die later in beeld schuift alsnog, en niet nog eens de vorige', async () => {
    geefDocument(6);
    zicht.inBeeld = (i) => i < 2;

    const { rerender } = await toonOverzicht();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));

    zicht.inBeeld = (i) => i < 4;
    rerender(<PdfPagePreview file={hetBestand} thumbnailWidth={120} />);

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));
    // En de eerste twee zijn niet nog een keer getekend.
    expect(getPageMock.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3, 4]);
  });

  it('schaalt de bladzijden naar de gevraagde breedte', async () => {
    // 600 punten breed bij een gevraagde 90 pixels is schaal 0,15.
    await toonOverzicht({ thumbnailWidth: 90 });

    await waitFor(() => expect(getViewportMock).toHaveBeenCalledWith({ scale: 0.15 }));
  });
});

/* ------------------------------------------------------------------ */
/* Bereiken                                                            */
/* ------------------------------------------------------------------ */

describe('bladzijdenoverzicht - gekozen bereiken', () => {
  const BEREIKEN = [
    { start: 1, end: 2, name: 'Ouverture' },
    { start: 3, end: 4, name: 'Finale' },
  ];

  /** De omlijsting om een bladzijde, waar de bereikkleur op staat. */
  function omlijsting(nummer: number): HTMLElement {
    const tegels = Array.from(document.querySelectorAll<HTMLElement>('.pdf-thumbnail'));
    return tegels[nummer - 1].firstElementChild as HTMLElement;
  }

  it('zet de naam van het bereik onder elke bladzijde die erbij hoort', async () => {
    await toonOverzicht({ selectedRanges: BEREIKEN });

    expect(screen.getAllByText('Ouverture')).toHaveLength(2);
    expect(screen.getAllByText('Finale')).toHaveLength(2);
  });

  it('geeft elk bereik een eigen kleur', async () => {
    await toonOverzicht({ selectedRanges: BEREIKEN });

    // Eerste bereik blauw, tweede groen - de eerste twee kleuren uit de reeks.
    // jsdom geeft kleuren terug als rgb().
    expect(omlijsting(1).style.border).toBe('3px solid rgb(59, 130, 246)');
    expect(omlijsting(3).style.border).toBe('3px solid rgb(16, 185, 129)');
  });

  it('gebruikt een eigen kleur als het bereik er een meebrengt', async () => {
    await toonOverzicht({ selectedRanges: [{ start: 2, end: 2, name: 'Solo', color: '#123456' }] });

    expect(omlijsting(2).style.border).toBe('3px solid rgb(18, 52, 86)');
  });

  it('laat bladzijden buiten elk bereik onopgesmukt', async () => {
    await toonOverzicht({ selectedRanges: [{ start: 1, end: 1, name: 'Ouverture' }] });

    expect(omlijsting(2).style.border).toBe('1px solid var(--border)');
    expect(screen.getAllByText('Ouverture')).toHaveLength(1);
  });

  it('houdt bij overlappende bereiken het eerste aan', async () => {
    await toonOverzicht({
      selectedRanges: [
        { start: 1, end: 4, name: 'Alles' },
        { start: 2, end: 3, name: 'Middenstuk' },
      ],
    });

    expect(screen.getAllByText('Alles')).toHaveLength(4);
    expect(screen.queryByText('Middenstuk')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Aanklikken                                                          */
/* ------------------------------------------------------------------ */

describe('bladzijdenoverzicht - aanklikken', () => {
  it('geeft door op welke bladzijde geklikt is', async () => {
    const gebruiker = userEvent.setup();
    const geklikt = vi.fn();
    const { container } = await toonOverzicht({ onPageClick: geklikt });

    const derde = container.querySelectorAll('.pdf-thumbnail')[2] as HTMLElement;
    await gebruiker.click(derde);

    expect(geklikt).toHaveBeenCalledWith(3);
  });

  it('wijst met de cursor aan dat er te klikken valt, en anders niet', async () => {
    const { container, rerender } = await toonOverzicht({ onPageClick: vi.fn() });
    const eerste = () => container.querySelector('.pdf-thumbnail') as HTMLElement;

    expect(eerste().style.cursor).toBe('pointer');

    rerender(<PdfPagePreview file={hetBestand} />);

    await waitFor(() => expect(eerste().style.cursor).toBe('default'));
  });
});
