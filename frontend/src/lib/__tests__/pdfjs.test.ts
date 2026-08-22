/**
 * Tests voor het nalezen van pdf.js.
 *
 * pdfjs-dist is ongeveer 330 kB plus een werkbestand van 1,4 MB. Dat hoort
 * niet in de eerste lading van de app te zitten - op de telefoon van een lid
 * dat onderweg even de repetitieagenda opzoekt, kost dat seconden.
 *
 * Twee dingen moeten daarbij kloppen:
 *
 *   - het werkbestand moet ingesteld zijn vóórdat de aanroeper de bibliotheek
 *     in handen krijgt. Gebeurt dat later, dan probeert pdf.js het bestand van
 *     een standaardadres te halen dat er niet is, en blijft de bladmuziek leeg
 *     zonder foutmelding.
 *   - een mislukte poging mag niet blijven plakken. Bewaart de module een
 *     kapotte belofte, dan blijft de pdf-lezer de rest van de sessie stuk,
 *     ook als het netwerk allang terug is - en alleen herladen helpt nog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const staat = vi.hoisted(() => ({
  /** Laat de eerste instelpoging van het werkbestand mislukken. */
  eersteKeerFalen: false,
  /** Wat er uiteindelijk is ingesteld. */
  workerSrc: '',
  /** Hoe vaak er is geprobeerd in te stellen. */
  pogingen: 0,
}));

vi.mock('pdfjs-dist', () => {
  const globalWorkerOptions = {};
  Object.defineProperty(globalWorkerOptions, 'workerSrc', {
    get: () => staat.workerSrc,
    set: (waarde: string) => {
      staat.pogingen += 1;
      if (staat.eersteKeerFalen && staat.pogingen === 1) {
        throw new Error('werkbestand niet bereikbaar');
      }
      staat.workerSrc = waarde;
    },
  });
  return {
    GlobalWorkerOptions: globalWorkerOptions,
    getDocument: vi.fn(),
    version: '6.2.108',
  };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

/** Laadt de module opnieuw in, zodat de bewaarde belofte weg is. */
async function verseModule() {
  vi.resetModules();
  return import('../pdfjs');
}

beforeEach(() => {
  staat.eersteKeerFalen = false;
  staat.workerSrc = '';
  staat.pogingen = 0;
});

describe('loadPdfjs', () => {
  it('levert de bibliotheek met het werkbestand al ingesteld', async () => {
    // De volgorde is het punt: de aanroeper krijgt pdf.js pas nadat
    // workerSrc staat, niet ervoor.
    const { loadPdfjs } = await verseModule();

    const pdfjs = await loadPdfjs();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');
    expect(pdfjs.getDocument).toBeTypeOf('function');
  });

  it('laadt maar één keer, hoe vaak je er ook om vraagt', async () => {
    // Elke pagina met bladmuziek vraagt hierom. Zonder het onthouden van de
    // belofte wordt het werkbestand per aanroep opnieuw ingesteld.
    const { loadPdfjs } = await verseModule();

    const eerste = await loadPdfjs();
    const tweede = await loadPdfjs();
    const derde = await loadPdfjs();

    expect(tweede).toBe(eerste);
    expect(derde).toBe(eerste);
    expect(staat.pogingen).toBe(1);
  });

  it('laat gelijktijdige aanvragers dezelfde belofte delen', async () => {
    // Een pagina met vier pdf-miniaturen vraagt vier keer tegelijk.
    const { loadPdfjs } = await verseModule();

    const [een, twee, drie] = await Promise.all([loadPdfjs(), loadPdfjs(), loadPdfjs()]);

    expect(twee).toBe(een);
    expect(drie).toBe(een);
    expect(staat.pogingen).toBe(1);
  });

  it('geeft dezelfde belofte terug voordat het laden klaar is', async () => {
    const { loadPdfjs } = await verseModule();

    const eerste = loadPdfjs();
    const tweede = loadPdfjs();

    expect(tweede).toBe(eerste);
    await eerste;
  });

  it('geeft een mislukte poging door aan de aanroeper', async () => {
    // De aanroeper moet zijn eigen foutmelding kunnen tonen ("bladmuziek kon
    // niet worden geladen") in plaats van een leeg vlak.
    staat.eersteKeerFalen = true;
    const { loadPdfjs } = await verseModule();

    await expect(loadPdfjs()).rejects.toThrow('werkbestand niet bereikbaar');
  });

  it('probeert het na een mislukte poging opnieuw', async () => {
    // Dit is het verschil tussen "even geen netwerk" en "de pdf-lezer is de
    // rest van de sessie stuk". Bleef de kapotte belofte bewaard, dan hielp
    // alleen nog het herladen van de hele app.
    staat.eersteKeerFalen = true;
    const { loadPdfjs } = await verseModule();

    await expect(loadPdfjs()).rejects.toThrow('werkbestand niet bereikbaar');

    const pdfjs = await loadPdfjs();
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');
    expect(staat.pogingen).toBe(2);
  });

  it('onthoudt de geslaagde poging na een mislukte', async () => {
    staat.eersteKeerFalen = true;
    const { loadPdfjs } = await verseModule();
    await expect(loadPdfjs()).rejects.toThrow();

    const eerste = await loadPdfjs();
    const tweede = await loadPdfjs();

    expect(tweede).toBe(eerste);
    expect(staat.pogingen).toBe(2);
  });
});
