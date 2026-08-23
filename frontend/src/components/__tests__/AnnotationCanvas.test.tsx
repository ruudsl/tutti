/**
 * Het tekendoek voor bladmuziek-aantekeningen: wat de gebruiker erop doet.
 *
 * AnnotationCanvas.tsx legt een doorzichtig <canvas> over een pdf-bladzijde,
 * vangt de aanwijzer op en geeft nieuwe aantekeningen door aan de omgeving.
 * Het bestand was nul procent gedekt.
 *
 * DRIE DINGEN OVER JSDOM, ZODAT DE KEUZES HIERONDER TE VOLGEN ZIJN.
 *
 * 1. `getContext('2d')` bestaat in jsdom niet echt. Hieronder komt er een
 *    opnemende namaakcontext voor in de plaats: elke aanroep en elke
 *    eigenschap die het component zet wordt bewaard. Zo is te controleren
 *    DAT er getekend wordt, en met welke kleur, dikte en op welke plek,
 *    zonder dat er ooit een pixel aan te pas komt. Wat er niet mee te
 *    controleren valt, is hoe het er daadwerkelijk uitziet.
 *
 * 2. jsdom rekent geen opmaak uit; `getBoundingClientRect()` geeft overal
 *    nullen. Het doek rekent schermpunten om met `(clientX - rect.left) /
 *    scale`, en met een nulrechthoek is dat gewoon `clientX / scale`. Een
 *    klik op clientX 120 bij schaal 1 komt dus op doekpunt 120 uit. Er wordt
 *    hier niets aan `getBoundingClientRect` gesleuteld - dat maakt de tests
 *    brozer dan ze waard zijn. Wat aan de rekensom hangt, wordt getest via
 *    de punten die het doek doorgeeft.
 *
 * 3. `Path2D` bestaat niet in jsdom. Er staat hieronder een kleine
 *    vervanging, want de stempeltekenaar bouwt er paden mee op.
 *
 * De tests draaien tegen een schil (`Bladzijde`) die de aantekeningen in
 * state bewaart, precies zoals PdfAnnotation/index.tsx dat doet. Zonder die
 * schil zou het doek een zojuist getekende aantekening nooit terugzien.
 *
 * NIET GETEST, EN BEWUST: het slepen van een bestaande aantekening. Dat kan
 * dit component niet - `onAnnotationUpdate` wordt binnengehaald en nooit
 * gebruikt, en het gereedschap 'select' keert bij de eerste regel al om. Er
 * staat hieronder een test die dat vastlegt, in plaats van een test die
 * doet alsof er versleept wordt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import AnnotationCanvas from '../PdfAnnotation/AnnotationCanvas';
import type { Annotation, Stamp, ToolType, ShapeType, Point } from '../PdfAnnotation/types';

/* ------------------------------------------------------------------ */
/* De namaakcontext                                                    */
/* ------------------------------------------------------------------ */

type Aanroep = { naam: string; args: unknown[] };

/** Alles wat het doek op de context aanroept of erop zet, op volgorde. */
let getekend: Aanroep[] = [];

const TEKENMETHODEN = [
  'save',
  'restore',
  'clearRect',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'quadraticCurveTo',
  'bezierCurveTo',
  'stroke',
  'fill',
  'rect',
  'ellipse',
  'arc',
  'translate',
  'rotate',
  'fillText',
  'setLineDash',
];

function maakNamaakContext(): CanvasRenderingContext2D {
  const doel: Record<string, unknown> = {};
  for (const naam of TEKENMETHODEN) {
    doel[naam] = (...args: unknown[]) => {
      getekend.push({ naam, args });
    };
  }
  // Eigenschappen die het doek zet worden ook opgenomen, met '=' ervoor, zodat
  // kleur en lijndikte net zo goed te controleren zijn als de tekenopdrachten.
  return new Proxy(doel, {
    set(d, sleutel, waarde) {
      getekend.push({ naam: `=${String(sleutel)}`, args: [waarde] });
      d[sleutel as string] = waarde;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Namaak-Path2D: onthoudt alleen dat hij bestaat en wat erin gaat. */
class NamaakPath2D {
  opdrachten: Aanroep[] = [];
  moveTo(...args: unknown[]) {
    this.opdrachten.push({ naam: 'moveTo', args });
  }
  lineTo(...args: unknown[]) {
    this.opdrachten.push({ naam: 'lineTo', args });
  }
  bezierCurveTo(...args: unknown[]) {
    this.opdrachten.push({ naam: 'bezierCurveTo', args });
  }
  closePath() {
    this.opdrachten.push({ naam: 'closePath', args: [] });
  }
}

/** Namen van de opdrachten, handig voor `toContain`. */
const namen = () => getekend.map((a) => a.naam);
/** Alle argumentenreeksen van één opdracht of eigenschap. */
const argsVan = (naam: string) => getekend.filter((a) => a.naam === naam).map((a) => a.args);

beforeEach(() => {
  getekend = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => maakNamaakContext() as unknown as RenderingContext,
  );
  (globalThis as unknown as { Path2D: unknown }).Path2D = NamaakPath2D;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { Path2D?: unknown }).Path2D;
});

/* ------------------------------------------------------------------ */
/* De schil om het doek                                                */
/* ------------------------------------------------------------------ */

const STEMPEL_TEKST: Stamp = {
  id: 'stamp-ff',
  name: 'ff',
  category: 'dynamics',
  svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" fill="#000">ff</text>',
  isBuiltin: true,
};

const STEMPEL_VORM: Stamp = {
  id: 'stamp-fermate',
  name: 'fermate',
  category: 'articulation',
  svgData:
    '<path d="M 5 20 C 5 10, 25 10, 25 20" fill="none" stroke="currentColor"/>' +
    '<circle cx="15" cy="18" r="2"/>' +
    '<line x1="5" y1="25" x2="25" y2="25"/>',
  isBuiltin: true,
};

const STEMPELS = [STEMPEL_TEKST, STEMPEL_VORM];

/** Wat het doek naar buiten gaf. */
let toegevoegd: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>[] = [];
let verwijderd: string[] = [];
let bijgewerkt: string[] = [];

beforeEach(() => {
  toegevoegd = [];
  verwijderd = [];
  bijgewerkt = [];
});

interface BladzijdeProps {
  gereedschap?: ToolType;
  vormtype?: ShapeType;
  kleur?: string;
  dikte?: number;
  dekking?: number;
  schaal?: number;
  stempel?: Stamp | null;
  begin?: Annotation[];
  breedte?: number;
  hoogte?: number;
}

function Bladzijde({
  gereedschap = 'freehand',
  vormtype = 'rectangle',
  kleur = '#ef4444',
  dikte = 2,
  dekking = 1,
  schaal = 1,
  stempel = null,
  begin = [],
  breedte = 400,
  hoogte = 300,
}: BladzijdeProps) {
  const [aantekeningen, setAantekeningen] = useState<Annotation[]>(begin);

  return (
    <AnnotationCanvas
      pageNumber={3}
      musicPieceId="stuk-1"
      width={breedte}
      height={hoogte}
      scale={schaal}
      activeTool={gereedschap}
      color={kleur}
      strokeWidth={dikte}
      opacity={dekking}
      selectedStamp={stempel}
      selectedShapeType={vormtype}
      stamps={STEMPELS}
      annotations={aantekeningen}
      onAnnotationAdd={(nieuw) => {
        toegevoegd.push(nieuw);
        setAantekeningen((vorige) => [
          ...vorige,
          { ...nieuw, id: `aantekening-${vorige.length + 1}`, createdAt: 'toen', updatedAt: 'toen' } as Annotation,
        ]);
      }}
      onAnnotationUpdate={(id) => {
        bijgewerkt.push(id);
      }}
      onAnnotationDelete={(id) => {
        verwijderd.push(id);
        setAantekeningen((vorige) => vorige.filter((a) => a.id !== id));
      }}
    />
  );
}

function toonBladzijde(props: BladzijdeProps = {}) {
  const { container } = render(<Bladzijde {...props} />);
  const doek = container.querySelector('canvas');
  if (!doek) throw new Error('geen doek gevonden');
  return { doek, container };
}

/** Aanwijzer neerzetten, over een reeks punten slepen en loslaten. */
function haal(doek: HTMLElement, punten: [number, number][]) {
  fireEvent.pointerDown(doek, { clientX: punten[0][0], clientY: punten[0][1] });
  for (const [x, y] of punten.slice(1)) {
    fireEvent.pointerMove(doek, { clientX: x, clientY: y });
  }
  fireEvent.pointerUp(doek);
}

/** Een vrijehand-aantekening om mee te beginnen. */
function vrijeHand(id: string, punten: Point[]): Annotation {
  return {
    id,
    musicPieceId: 'stuk-1',
    pageNumber: 3,
    annotationType: 'freehand',
    data: { points: punten, color: '#000000', width: 2, opacity: 1 },
    color: '#000000',
    strokeWidth: 2,
    opacity: 1,
    isShared: false,
    createdAt: 'toen',
    updatedAt: 'toen',
  };
}

/* ------------------------------------------------------------------ */
/* Tekenen: wat er de deur uit gaat                                    */
/* ------------------------------------------------------------------ */

describe('AnnotationCanvas - vrije hand', () => {
  it('geeft een gesleepte haal door als vrijehand-aantekening', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand', kleur: '#22c55e', dikte: 4, dekking: 0.8 });

    haal(doek, [
      [10, 20],
      [30, 40],
      [50, 60],
    ]);

    expect(toegevoegd).toHaveLength(1);
    const nieuw = toegevoegd[0];
    expect(nieuw.annotationType).toBe('freehand');
    expect(nieuw.musicPieceId).toBe('stuk-1');
    expect(nieuw.pageNumber).toBe(3);
    expect(nieuw.color).toBe('#22c55e');
    expect(nieuw.strokeWidth).toBe(4);
    expect(nieuw.opacity).toBe(0.8);
    expect(nieuw.isShared).toBe(false);
    expect((nieuw.data as { points: Point[] }).points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
  });

  it('maakt van een enkele klik zonder beweging geen aantekening', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(doek);

    expect(toegevoegd).toHaveLength(0);
  });

  it('negeert beweging zolang de aanwijzer niet neergedrukt is', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand' });

    fireEvent.pointerMove(doek, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(doek, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(doek);

    expect(toegevoegd).toHaveLength(0);
  });

  it('rondt de haal ook af als de aanwijzer het doek verlaat', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(doek, { clientX: 60, clientY: 10 });
    fireEvent.pointerLeave(doek);

    expect(toegevoegd).toHaveLength(1);
    expect(toegevoegd[0].annotationType).toBe('freehand');
  });

  it('deelt de schermpunten door de schaal, zodat de aantekening bij de bladzijde hoort en niet bij de zoom', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand', schaal: 2 });

    haal(doek, [
      [100, 200],
      [300, 400],
    ]);

    expect((toegevoegd[0].data as { points: Point[] }).points).toEqual([
      { x: 50, y: 100 },
      { x: 150, y: 200 },
    ]);
  });

  it('tekent de zojuist gemaakte haal ook echt op het doek', () => {
    const { doek } = toonBladzijde({ gereedschap: 'freehand', kleur: '#22c55e', dikte: 3 });

    getekend = [];
    haal(doek, [
      [10, 10],
      [40, 10],
      [70, 10],
    ]);

    // De haal zit nu in de aantekeningen en wordt bij het hertekenen als
    // vloeiende lijn neergezet: beginPath, moveTo, quadratische bochten en
    // stroke, in de gevraagde kleur en dikte.
    expect(namen()).toContain('beginPath');
    expect(namen()).toContain('quadraticCurveTo');
    expect(namen()).toContain('stroke');
    expect(argsVan('=strokeStyle')).toContainEqual(['#22c55e']);
    expect(argsVan('=lineWidth')).toContainEqual([3]);
  });
});

describe('AnnotationCanvas - markeerstift', () => {
  it('geeft een gesleepte haal door als markering met vaste doorschijnendheid', () => {
    const { doek } = toonBladzijde({ gereedschap: 'highlight', kleur: '#facc15', dikte: 2, dekking: 1 });

    haal(doek, [
      [10, 10],
      [80, 12],
    ]);

    expect(toegevoegd).toHaveLength(1);
    const nieuw = toegevoegd[0];
    expect(nieuw.annotationType).toBe('highlight');
    // De markeerstift is vijf keer zo breed als de ingestelde dikte en altijd
    // doorschijnend, wat de gebruiker ook bij dekking heeft staan.
    expect(nieuw.strokeWidth).toBe(10);
    expect(nieuw.opacity).toBe(0.3);
    expect((nieuw.data as { points: Point[] }).points).toHaveLength(2);
  });
});

describe('AnnotationCanvas - vormen', () => {
  const vormen: ShapeType[] = ['rectangle', 'circle', 'line', 'arrow'];

  for (const vorm of vormen) {
    it(`geeft een gesleepte ${vorm} door met begin- en eindpunt`, () => {
      const { doek } = toonBladzijde({ gereedschap: 'shape', vormtype: vorm });

      haal(doek, [
        [20, 30],
        [60, 70],
        [120, 150],
      ]);

      expect(toegevoegd).toHaveLength(1);
      expect(toegevoegd[0].annotationType).toBe('shape');
      expect(toegevoegd[0].data).toMatchObject({
        shapeType: vorm,
        start: { x: 20, y: 30 },
        end: { x: 120, y: 150 },
        filled: false,
      });
    });
  }

  it('gebruikt de rechthoek als er geen vormtype meegegeven is', () => {
    const { container } = render(
      <AnnotationCanvas
        pageNumber={1}
        musicPieceId="stuk-1"
        width={400}
        height={300}
        scale={1}
        activeTool="shape"
        color="#000000"
        strokeWidth={2}
        opacity={1}
        selectedStamp={null}
        stamps={STEMPELS}
        annotations={[]}
        onAnnotationAdd={(nieuw) => toegevoegd.push(nieuw)}
        onAnnotationUpdate={() => {}}
        onAnnotationDelete={() => {}}
      />,
    );
    const doek = container.querySelector('canvas') as HTMLCanvasElement;

    haal(doek, [
      [10, 10],
      [50, 50],
    ]);

    expect(toegevoegd[0].data).toMatchObject({ shapeType: 'rectangle' });
  });

  it('tekent tijdens het slepen een stippellijn als voorbeeld, en laat die na loslaten los', () => {
    const { doek } = toonBladzijde({ gereedschap: 'shape', vormtype: 'rectangle' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    getekend = [];
    fireEvent.pointerMove(doek, { clientX: 90, clientY: 70 });

    expect(argsVan('setLineDash').length).toBeGreaterThan(0);
    expect(argsVan('rect')).toContainEqual([10, 10, 80, 60]);

    getekend = [];
    fireEvent.pointerUp(doek);

    // Na het loslaten is de stippellijn weg: de vaste vorm wordt getekend.
    expect(argsVan('setLineDash')).toHaveLength(0);
    expect(argsVan('rect')).toContainEqual([10, 10, 80, 60]);
  });

  it('tekent het voorbeeld van een cirkel, lijn en pijl tijdens het slepen', () => {
    for (const vorm of ['circle', 'line', 'arrow'] as ShapeType[]) {
      const { doek, container } = toonBladzijde({ gereedschap: 'shape', vormtype: vorm });

      fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
      getekend = [];
      fireEvent.pointerMove(doek, { clientX: 90, clientY: 70 });

      if (vorm === 'circle') {
        expect(namen()).toContain('ellipse');
      } else {
        expect(argsVan('lineTo').length).toBeGreaterThan(0);
      }
      // De pijl krijgt twee weerhaken, dus meer lijnstukken dan een kale lijn.
      if (vorm === 'arrow') {
        expect(argsVan('lineTo').length).toBeGreaterThanOrEqual(3);
      }
      container.remove();
    }
  });
});

describe('AnnotationCanvas - tekst', () => {
  it('opent een invoerveld op de klikplek en maakt er na Enter een tekstaantekening van', async () => {
    const gebruiker = userEvent.setup();
    const { doek } = toonBladzijde({ gereedschap: 'text', kleur: '#1d4ed8', schaal: 2 });

    fireEvent.pointerDown(doek, { clientX: 120, clientY: 80 });

    const veld = screen.getByPlaceholderText('Typ hier...');
    // Het veld staat op de plek waar geklikt is: doekpunt 60 maal schaal 2.
    expect(veld.parentElement).toHaveStyle({ left: '120px', top: '80px' });

    await gebruiker.type(veld, 'crescendo{Enter}');

    expect(toegevoegd).toHaveLength(1);
    expect(toegevoegd[0].annotationType).toBe('text');
    expect(toegevoegd[0].data).toMatchObject({
      content: 'crescendo',
      position: { x: 60, y: 40 },
      fontSize: 16,
      color: '#1d4ed8',
    });
    expect(screen.queryByPlaceholderText('Typ hier...')).not.toBeInTheDocument();
  });

  it('maakt maar één aantekening als het veld na Enter ook nog vervaagt', async () => {
    const gebruiker = userEvent.setup();
    const { doek } = toonBladzijde({ gereedschap: 'text' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    const veld = screen.getByPlaceholderText('Typ hier...');
    await gebruiker.type(veld, 'da capo{Enter}');
    // Klikken buiten het veld, zoals een gebruiker meteen daarna zou doen.
    await gebruiker.click(doek);

    expect(toegevoegd.filter((a) => a.annotationType === 'text')).toHaveLength(1);
  });

  it('gooit de tekst weg bij Escape', async () => {
    const gebruiker = userEvent.setup();
    const { doek } = toonBladzijde({ gereedschap: 'text' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    const veld = screen.getByPlaceholderText('Typ hier...');
    await gebruiker.type(veld, 'toch maar niet{Escape}');

    expect(toegevoegd).toHaveLength(0);
    expect(screen.queryByPlaceholderText('Typ hier...')).not.toBeInTheDocument();
  });

  it('maakt geen aantekening van louter spaties', async () => {
    const gebruiker = userEvent.setup();
    const { doek } = toonBladzijde({ gereedschap: 'text' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    const veld = screen.getByPlaceholderText('Typ hier...');
    await gebruiker.type(veld, '   {Enter}');

    expect(toegevoegd).toHaveLength(0);
    expect(screen.queryByPlaceholderText('Typ hier...')).not.toBeInTheDocument();
  });

  it('legt de tekst ook vast als de gebruiker het veld verlaat zonder Enter', async () => {
    const gebruiker = userEvent.setup();
    const { doek } = toonBladzijde({ gereedschap: 'text' });

    fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
    const veld = screen.getByPlaceholderText('Typ hier...');
    await gebruiker.type(veld, 'ritenuto');
    fireEvent.blur(veld);

    expect(toegevoegd).toHaveLength(1);
    expect(toegevoegd[0].data).toMatchObject({ content: 'ritenuto' });
  });

  it('zet het invoerveld scherp zodat er meteen getypt kan worden', () => {
    vi.useFakeTimers();
    try {
      const { doek } = toonBladzijde({ gereedschap: 'text' });
      fireEvent.pointerDown(doek, { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByPlaceholderText('Typ hier...')).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AnnotationCanvas - stempels', () => {
  it('zet een stempel neer bij één klik, zonder te hoeven slepen', () => {
    const { doek } = toonBladzijde({ gereedschap: 'stamp', stempel: STEMPEL_TEKST, kleur: '#0f172a' });

    fireEvent.pointerDown(doek, { clientX: 40, clientY: 90 });

    expect(toegevoegd).toHaveLength(1);
    expect(toegevoegd[0].annotationType).toBe('stamp');
    expect(toegevoegd[0].data).toMatchObject({
      stampId: 'stamp-ff',
      position: { x: 40, y: 90 },
      scale: 1,
      rotation: 0,
      color: '#0f172a',
    });
  });

  it('zet geen stempel neer als er nog geen gekozen is', () => {
    const { doek } = toonBladzijde({ gereedschap: 'stamp', stempel: null });

    fireEvent.pointerDown(doek, { clientX: 40, clientY: 90 });
    fireEvent.pointerUp(doek);

    expect(toegevoegd).toHaveLength(0);
  });

  it('tekent een tekststempel met de tekst uit het svg', () => {
    const { doek } = toonBladzijde({ gereedschap: 'stamp', stempel: STEMPEL_TEKST });

    getekend = [];
    fireEvent.pointerDown(doek, { clientX: 40, clientY: 90 });

    expect(argsVan('translate')).toContainEqual([40, 90]);
    expect(argsVan('fillText')).toContainEqual(['ff', 0, 0]);
    // font-style en font-weight uit het svg komen in het lettertype terecht.
    expect(argsVan('=font').some(([f]) => String(f).includes('italic') && String(f).includes('bold'))).toBe(true);
  });

  it('tekent een vormstempel met pad, cirkel en lijn', () => {
    const { doek } = toonBladzijde({ gereedschap: 'stamp', stempel: STEMPEL_VORM });

    getekend = [];
    fireEvent.pointerDown(doek, { clientX: 40, clientY: 90 });

    expect(namen()).toContain('arc'); // de cirkel
    expect(namen()).toContain('moveTo'); // de lijn
    expect(namen()).toContain('stroke');
  });

  it('slaat een stempel over waarvan het ontwerp niet meer bestaat', () => {
    const zoek: Annotation = {
      id: 'weg',
      musicPieceId: 'stuk-1',
      pageNumber: 3,
      annotationType: 'stamp',
      data: { position: { x: 10, y: 10 }, stampId: 'bestaat-niet', scale: 1, color: '#000', rotation: 0 },
      color: '#000',
      strokeWidth: 2,
      opacity: 1,
      isShared: false,
      createdAt: 'toen',
      updatedAt: 'toen',
    };
    getekend = [];
    toonBladzijde({ begin: [zoek] });

    // Er wordt niets van getekend, en het doek loopt er niet op stuk.
    expect(namen()).not.toContain('fillText');
  });
});

/* ------------------------------------------------------------------ */
/* Weghalen                                                            */
/* ------------------------------------------------------------------ */

describe('AnnotationCanvas - gum', () => {
  it('verwijdert de haal waar de gum overheen gaat', () => {
    const dichtbij = vrijeHand('haal-1', [
      { x: 50, y: 50 },
      { x: 60, y: 50 },
    ]);
    const { doek } = toonBladzijde({ gereedschap: 'eraser', dikte: 4, begin: [dichtbij] });

    haal(doek, [
      [40, 50],
      [52, 50],
    ]);

    expect(verwijderd).toEqual(['haal-1']);
  });

  it('laat een haal die ver van de gum ligt staan', () => {
    const veraf = vrijeHand('haal-1', [
      { x: 300, y: 200 },
      { x: 320, y: 200 },
    ]);
    const { doek } = toonBladzijde({ gereedschap: 'eraser', dikte: 4, begin: [veraf] });

    haal(doek, [
      [10, 10],
      [20, 20],
    ]);

    expect(verwijderd).toEqual([]);
  });

  it('verwijdert elke geraakte haal precies één keer', () => {
    const een = vrijeHand('haal-1', [
      { x: 10, y: 10 },
      { x: 12, y: 10 },
      { x: 14, y: 10 },
    ]);
    const twee = vrijeHand('haal-2', [
      { x: 11, y: 11 },
      { x: 13, y: 11 },
    ]);
    const { doek } = toonBladzijde({ gereedschap: 'eraser', dikte: 4, begin: [een, twee] });

    haal(doek, [
      [10, 10],
      [12, 10],
    ]);

    expect(verwijderd).toEqual(['haal-1', 'haal-2']);
  });

  it('laat vormen, tekst en stempels ongemoeid - de gum kent alleen vrije hand', () => {
    // Karakterisering, geen goedkeuring: de gum kijkt in handlePointerUp
    // uitsluitend naar aantekeningen van het type 'freehand'. Wie met de gum
    // over een pijl of een woord gaat, ziet er niets van verdwijnen. Dat is
    // hier vastgelegd zodat een latere uitbreiding zichtbaar wordt in plaats
    // van stilletjes te gebeuren.
    const vorm: Annotation = {
      id: 'vorm-1',
      musicPieceId: 'stuk-1',
      pageNumber: 3,
      annotationType: 'shape',
      data: {
        shapeType: 'line',
        start: { x: 10, y: 10 },
        end: { x: 20, y: 10 },
        color: '#000',
        strokeWidth: 2,
        filled: false,
      },
      color: '#000',
      strokeWidth: 2,
      opacity: 1,
      isShared: false,
      createdAt: 'toen',
      updatedAt: 'toen',
    };
    const { doek } = toonBladzijde({ gereedschap: 'eraser', dikte: 4, begin: [vorm] });

    haal(doek, [
      [10, 10],
      [20, 10],
    ]);

    expect(verwijderd).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Gereedschapskeuze                                                   */
/* ------------------------------------------------------------------ */

describe('AnnotationCanvas - gereedschapskeuze', () => {
  const cursors: [ToolType, string][] = [
    ['select', 'default'],
    ['freehand', 'crosshair'],
    ['highlight', 'text'],
    ['text', 'text'],
    ['stamp', 'copy'],
    ['shape', 'crosshair'],
    ['eraser', 'not-allowed'],
  ];

  for (const [gereedschap, cursor] of cursors) {
    it(`toont de cursor '${cursor}' bij het gereedschap '${gereedschap}'`, () => {
      const { doek } = toonBladzijde({ gereedschap });
      expect(doek).toHaveStyle({ cursor });
    });
  }

  it('doet niets bij het selectiegereedschap - dit doek kan nog niets selecteren of verplaatsen', () => {
    // Vastgelegd omdat het component `onAnnotationUpdate` wel binnenhaalt en
    // nooit gebruikt: er is geen selecteren en geen verslepen van bestaande
    // aantekeningen. Zolang dat zo is, hoort een sleep met 'select' niets te
    // doen - en niet per ongeluk een haal te tekenen.
    const bestaand = vrijeHand('haal-1', [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
    ]);
    const { doek } = toonBladzijde({ gereedschap: 'select', begin: [bestaand] });

    haal(doek, [
      [10, 10],
      [40, 40],
      [80, 80],
    ]);

    expect(toegevoegd).toEqual([]);
    expect(verwijderd).toEqual([]);
    expect(bijgewerkt).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Bestaande aantekeningen tekenen                                     */
/* ------------------------------------------------------------------ */

describe('AnnotationCanvas - bestaande aantekeningen', () => {
  it('tekent elk soort aantekening dat de bladzijde meekrijgt', () => {
    const alles: Annotation[] = [
      vrijeHand('a1', [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
      ]),
      {
        id: 'a2',
        musicPieceId: 'stuk-1',
        pageNumber: 3,
        annotationType: 'highlight',
        data: {
          points: [
            { x: 10, y: 10 },
            { x: 40, y: 10 },
            { x: 40, y: 20 },
          ],
          color: '#facc15',
          opacity: 0.3,
        },
        color: '#facc15',
        strokeWidth: 10,
        opacity: 0.3,
        isShared: false,
        createdAt: 'toen',
        updatedAt: 'toen',
      },
      {
        id: 'a3',
        musicPieceId: 'stuk-1',
        pageNumber: 3,
        annotationType: 'text',
        data: { position: { x: 30, y: 60 }, content: 'dolce', fontSize: 16, color: '#1d4ed8' },
        color: '#1d4ed8',
        strokeWidth: 2,
        opacity: 1,
        isShared: false,
        createdAt: 'toen',
        updatedAt: 'toen',
      },
      {
        id: 'a4',
        musicPieceId: 'stuk-1',
        pageNumber: 3,
        annotationType: 'stamp',
        data: { position: { x: 70, y: 70 }, stampId: 'stamp-ff', scale: 1, color: '#000', rotation: 90 },
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        isShared: false,
        createdAt: 'toen',
        updatedAt: 'toen',
      },
    ];

    getekend = [];
    toonBladzijde({ begin: alles });

    expect(namen()).toContain('clearRect');
    expect(argsVan('fillText')).toContainEqual(['dolce', 30, 60]);
    expect(argsVan('fillText')).toContainEqual(['ff', 0, 0]);
    expect(argsVan('translate')).toContainEqual([70, 70]);
    expect(argsVan('rotate')).toContainEqual([(90 * Math.PI) / 180]);
    expect(namen()).toContain('closePath'); // de markering wordt gesloten en gevuld
    expect(namen()).toContain('fill');
  });

  it('tekent alle vier de vormsoorten, en vult een gevulde vorm', () => {
    const vorm = (id: string, shapeType: ShapeType, filled: boolean): Annotation => ({
      id,
      musicPieceId: 'stuk-1',
      pageNumber: 3,
      annotationType: 'shape',
      data: { shapeType, start: { x: 10, y: 10 }, end: { x: 50, y: 40 }, color: '#000', strokeWidth: 2, filled },
      color: '#000',
      strokeWidth: 2,
      opacity: 1,
      isShared: false,
      createdAt: 'toen',
      updatedAt: 'toen',
    });

    getekend = [];
    toonBladzijde({
      begin: [
        vorm('v1', 'rectangle', true),
        vorm('v2', 'circle', false),
        vorm('v3', 'line', false),
        vorm('v4', 'arrow', false),
      ],
    });

    expect(argsVan('rect')).toContainEqual([10, 10, 40, 30]);
    expect(namen()).toContain('ellipse');
    expect(namen()).toContain('fill'); // alleen de gevulde rechthoek
    expect(argsVan('lineTo').length).toBeGreaterThanOrEqual(5); // lijn plus pijl met weerhaken
  });

  it('slaat een haal van één punt over - daar valt geen lijn van te maken', () => {
    getekend = [];
    toonBladzijde({ begin: [vrijeHand('a1', [{ x: 10, y: 10 }])] });

    expect(namen()).not.toContain('quadraticCurveTo');
  });

  it('schaalt wat er getekend wordt mee met de zoom', () => {
    getekend = [];
    toonBladzijde({
      schaal: 2,
      begin: [
        {
          id: 'a1',
          musicPieceId: 'stuk-1',
          pageNumber: 3,
          annotationType: 'text',
          data: { position: { x: 30, y: 60 }, content: 'dolce', fontSize: 16, color: '#000' },
          color: '#000',
          strokeWidth: 2,
          opacity: 1,
          isShared: false,
          createdAt: 'toen',
          updatedAt: 'toen',
        },
      ],
    });

    expect(argsVan('fillText')).toContainEqual(['dolce', 60, 120]);
  });
});

/* ------------------------------------------------------------------ */
/* De laag zelf                                                        */
/* ------------------------------------------------------------------ */

describe('AnnotationCanvas - de laag over de bladzijde', () => {
  it('geeft het doek een beeldpuntenraster dat meegroeit met zoom en schermdichtheid', () => {
    const oud = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    try {
      const { doek } = toonBladzijde({ breedte: 400, hoogte: 300, schaal: 1.5 });
      expect(doek.width).toBe(400 * 1.5 * 2);
      expect(doek.height).toBe(300 * 1.5 * 2);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: oud, configurable: true });
    }
  });

  it('legt de laag over de hele vergrote bladzijde, zodat je onderaan net zo goed kunt tekenen als bovenaan', () => {
    // BEWIJS van een echte fout, niet zomaar een vastlegging.
    //
    // Het doek stond op `width: width` en `height: height`, dus op de
    // ONgeschaalde maat, terwijl PdfAnnotation/index.tsx de bladzijde in een
    // vak van `pageWidth * scale` bij `pageHeight * scale` zet. Bij zoom 2
    // bedekte de aantekeningenlaag daardoor maar een kwart van de bladzijde:
    // op de rechterhelft en de onderhelft kwam geen enkele aanwijzer meer aan,
    // en alles wat wel getekend werd verscheen op de halve afstand van de
    // linkerbovenhoek - het doek tekent een punt namelijk op `x * scale * dpr`
    // beeldpunten in een raster dat `width * scale * dpr` breed is.
    //
    // Dat het invoerveld voor tekst al op `x * scale` gezet wordt, laat zien
    // welke maat de bedoeling was: schermplek = doekpunt maal schaal.
    //
    // Deze test was rood op de oude code (400px in plaats van 800px).
    const { doek, container } = toonBladzijde({ breedte: 400, hoogte: 300, schaal: 2 });

    expect(doek).toHaveStyle({ width: '800px', height: '600px' });
    expect(container.firstElementChild).toHaveStyle({ width: '800px', height: '600px' });
  });
});
