/**
 * De gereedschapsbalk bij het tekenen op bladmuziek.
 *
 * Deze balk kiest het gereedschap, de kleur, de lijndikte en de dekking, en
 * hij bevat de stempels (ff, rit., fermate) en de knoppen voor ongedaan
 * maken, opnieuw en alles wissen. Hij tekent zelf niets - hij geeft alleen
 * door wat de gebruiker aanwijst. Daarom staat er hieronder geen namaakcanvas
 * en geen pdf: dit is gewone knoppen-en-toetsen-code.
 *
 * TWEE KEUZES DIE DE TESTS HIERONDER VERKLAREN.
 *
 * 1. `react-i18next` is weggemockt met een `t` die de sleutel teruggeeft. De
 *    tests zoeken knoppen dus op sleutel ('annotationToolbar.tools.stamp') en
 *    niet op de Nederlandse tekst. Dat is met opzet: een test die op de
 *    vertaling zoekt gaat stuk zodra iemand een komma in de vertaling
 *    verandert, en dat zegt niets over de balk.
 *
 * 2. De balk krijgt het actieve gereedschap van buiten (`activeTool`) maar
 *    bewaart de open kiezers zelf. Een test die de balk los neerzet, ziet de
 *    vormkiezer daarom nooit opengaan. Vandaar de schil `Balk` hieronder, die
 *    de keuzes bewaart zoals PdfAnnotation/index.tsx dat doet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AnnotationToolbar } from '../PdfAnnotation/AnnotationToolbar';
import type { Stamp, ToolType, ShapeType } from '../PdfAnnotation/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

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
});

const STEMPELS: Stamp[] = [
  {
    id: 'stamp-ff',
    name: 'ff',
    category: 'dynamics',
    svgData: '<text x="15" y="20" font-size="18">ff</text>',
    isBuiltin: true,
  },
  {
    id: 'stamp-pp',
    name: 'pp',
    category: 'dynamics',
    svgData: '<text x="15" y="20" font-size="18">pp</text>',
    isBuiltin: true,
  },
  {
    id: 'stamp-rit',
    name: 'rit.',
    category: 'tempo',
    svgData: '<text x="15" y="20" font-size="14">rit.</text>',
    isBuiltin: true,
  },
  {
    id: 'stamp-fermate',
    name: 'Fermate',
    category: 'tempo',
    svgData: '<circle cx="15" cy="20" r="3" fill="#000"/>',
    isBuiltin: true,
  },
];

/** Wat de balk naar buiten gaf. */
let gewist: number;
let ongedaan: number;
let opnieuw: number;

beforeEach(() => {
  gewist = 0;
  ongedaan = 0;
  opnieuw = 0;
  localStorage.clear();
});

interface BalkProps {
  beginGereedschap?: ToolType;
  beginKleur?: string;
  beginDikte?: number;
  beginDekking?: number;
  beginVorm?: ShapeType;
  stempels?: Stamp[];
  kanOngedaan?: boolean;
  kanOpnieuw?: boolean;
}

/**
 * De schil om de balk: bewaart de keuzes, net als het scherm eromheen doet.
 * Wat de gebruiker koos is af te lezen aan de regel onderaan.
 */
function Balk({
  beginGereedschap = 'freehand',
  beginKleur = '#DC2626',
  beginDikte = 2,
  beginDekking = 1,
  beginVorm = 'rectangle',
  stempels = STEMPELS,
  kanOngedaan = false,
  kanOpnieuw = false,
}: BalkProps) {
  const [gereedschap, setGereedschap] = useState<ToolType>(beginGereedschap);
  const [kleur, setKleur] = useState(beginKleur);
  const [dikte, setDikte] = useState(beginDikte);
  const [dekking, setDekking] = useState(beginDekking);
  const [vorm, setVorm] = useState<ShapeType>(beginVorm);
  const [stempel, setStempel] = useState<string | null>(null);

  return (
    <>
      <AnnotationToolbar
        activeTool={gereedschap}
        onToolChange={setGereedschap}
        color={kleur}
        onColorChange={setKleur}
        strokeWidth={dikte}
        onStrokeWidthChange={setDikte}
        opacity={dekking}
        onOpacityChange={setDekking}
        onUndo={() => (ongedaan += 1)}
        onRedo={() => (opnieuw += 1)}
        onClear={() => (gewist += 1)}
        canUndo={kanOngedaan}
        canRedo={kanOpnieuw}
        stamps={stempels}
        selectedStamp={stempel}
        onStampSelect={setStempel}
        selectedShapeType={vorm}
        onShapeTypeChange={setVorm}
      />
      <p data-testid="keuze">
        {gereedschap} | {kleur} | {dikte} | {dekking} | {vorm} | {stempel ?? 'geen stempel'}
      </p>
    </>
  );
}

/** De regel met de huidige keuzes. */
function keuze(): string {
  return screen.getByTestId('keuze').textContent ?? '';
}

/** Een gereedschapsknop op zijn vertaalsleutel. */
function gereedschapsknop(naam: string): HTMLElement {
  return screen.getByRole('button', { name: `annotationToolbar.tools.${naam}` });
}

/* ------------------------------------------------------------------ */
/* Gereedschap kiezen                                                  */
/* ------------------------------------------------------------------ */

describe('gereedschapsbalk - gereedschap', () => {
  it('biedt alle zeven gereedschappen aan', () => {
    render(<Balk />);

    for (const naam of ['select', 'freehand', 'highlight', 'text', 'stamp', 'shape', 'eraser']) {
      expect(gereedschapsknop(naam)).toBeInTheDocument();
    }
  });

  it('wisselt van gereedschap bij een klik', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(gereedschapsknop('highlight'));

    expect(keuze()).toContain('highlight');
  });

  it('opent de stempellade zodra het stempelgereedschap gekozen wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    expect(screen.queryByPlaceholderText('annotationToolbar.searchStamps')).not.toBeInTheDocument();

    await gebruiker.click(gereedschapsknop('stamp'));

    expect(screen.getByPlaceholderText('annotationToolbar.searchStamps')).toBeInTheDocument();
  });

  it('opent de vormkiezer bij het vormgereedschap en sluit de stempellade', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(gereedschapsknop('stamp'));
    await gebruiker.click(gereedschapsknop('shape'));

    expect(screen.getByText('annotationToolbar.shapeType')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('annotationToolbar.searchStamps')).not.toBeInTheDocument();
  });

  it('sluit beide laden bij een gereedschap dat er geen heeft', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(gereedschapsknop('stamp'));
    await gebruiker.click(gereedschapsknop('eraser'));

    expect(screen.queryByPlaceholderText('annotationToolbar.searchStamps')).not.toBeInTheDocument();
    expect(screen.queryByText('annotationToolbar.shapeType')).not.toBeInTheDocument();
  });

  it('kiest een vorm binnen het vormgereedschap', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await gebruiker.click(gereedschapsknop('shape'));

    await gebruiker.click(screen.getByTitle('annotationToolbar.shapes.arrow'));

    expect(keuze()).toContain('arrow');
  });
});

/* ------------------------------------------------------------------ */
/* Toetsen                                                             */
/* ------------------------------------------------------------------ */

describe('gereedschapsbalk - sneltoetsen', () => {
  it('kiest gereedschap met de cijfers 1 tot en met 7', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.keyboard('3');
    expect(keuze()).toContain('highlight');

    await gebruiker.keyboard('7');
    expect(keuze()).toContain('eraser');

    await gebruiker.keyboard('1');
    expect(keuze()).toContain('select');
  });

  it('opent met de cijfertoets ook de bijbehorende lade', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.keyboard('5');
    expect(screen.getByPlaceholderText('annotationToolbar.searchStamps')).toBeInTheDocument();

    await gebruiker.keyboard('6');
    expect(screen.getByText('annotationToolbar.shapeType')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('annotationToolbar.searchStamps')).not.toBeInTheDocument();

    await gebruiker.keyboard('2');
    expect(screen.queryByText('annotationToolbar.shapeType')).not.toBeInTheDocument();
  });

  it('laat de cijfers met rust terwijl er in het zoekveld getypt wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await gebruiker.keyboard('5');

    await gebruiker.click(screen.getByPlaceholderText('annotationToolbar.searchStamps'));
    await gebruiker.keyboard('3');

    // Het gereedschap blijft 'stamp', en de 3 komt in het veld terecht.
    expect(keuze()).toContain('stamp');
    expect(screen.getByPlaceholderText('annotationToolbar.searchStamps')).toHaveValue('3');
  });

  it('maakt ongedaan en doet opnieuw met Ctrl+Z, Ctrl+Y en Ctrl+Shift+Z', () => {
    render(<Balk kanOngedaan kanOpnieuw />);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(ongedaan).toBe(1);

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(opnieuw).toBe(1);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(opnieuw).toBe(2);
    // Ctrl+Shift+Z is opnieuw, geen ongedaan maken.
    expect(ongedaan).toBe(1);
  });

  /**
   * BEWIJS - Cmd+Shift+Z deed niets.
   *
   * Op een Mac is Cmd+Shift+Z de gebruikelijke toets voor "opnieuw", en die
   * levert `e.key === 'Z'` op - met een hoofdletter, want Shift staat op de
   * toets. De vergelijking hierboven was `e.key === 'z' && e.shiftKey`, en
   * die komt op een hoofdletter Z nooit uit. Ctrl+Y bestaat op een Mac niet
   * als toetscombinatie, dus Mac-gebruikers hadden helemaal geen manier om
   * iets opnieuw te doen: een weggegumde vingerzetting was weg.
   *
   * De reparatie: de toets kleinletteren voordat er vergeleken wordt. Dat
   * repareert meteen hetzelfde geval met Caps Lock aan.
   *
   * Op de oude code is deze test rood: `opnieuw` bleef op nul staan.
   * Nagekeken door AnnotationToolbar.tsx op HEAD terug te zetten en deze test
   * te draaien.
   */
  it('doet opnieuw met Cmd+Shift+Z, zoals de rest van de Mac', () => {
    render(<Balk kanOngedaan kanOpnieuw />);

    // Zo komt de toets binnen als Shift ingedrukt is: een hoofdletter.
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });

    expect(opnieuw).toBe(1);
    expect(ongedaan).toBe(0);
  });

  it('maakt ook ongedaan met Cmd+Z', () => {
    render(<Balk kanOngedaan />);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    expect(ongedaan).toBe(1);
  });

  /**
   * BEWIJS - Cmd+1 wisselde van gereedschap in plaats van van tabblad.
   *
   * De cijfertoetsen werden aangenomen zonder naar Ctrl, Cmd of Alt te
   * kijken, met een `preventDefault()` erachteraan. Cmd+1 tot Cmd+7 zijn in
   * elke browser "spring naar tabblad zoveel"; wie tijdens het annoteren naar
   * een ander tabblad wilde, bleef staan waar hij stond en had er ook nog een
   * ander gereedschap bij.
   *
   * De reparatie: een cijfer met Ctrl, Cmd of Alt erbij is niet voor deze
   * balk bedoeld.
   *
   * Op de oude code is deze test rood: het gereedschap sprong naar
   * 'highlight' en de toets was tegengehouden. Nagekeken door
   * AnnotationToolbar.tsx op HEAD terug te zetten en deze test te draaien.
   */
  it('laat de tabbladtoetsen van de browser met rust', () => {
    render(<Balk />);

    const metCmd = new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(metCmd);
    const metCtrl = new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(metCtrl);

    expect(keuze()).toContain('freehand');
    expect(metCmd.defaultPrevented).toBe(false);
    expect(metCtrl.defaultPrevented).toBe(false);
  });

  it('luistert niet meer nadat de balk weg is', () => {
    const { unmount } = render(<Balk kanOngedaan />);

    unmount();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(ongedaan).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Kleur, dikte en dekking                                             */
/* ------------------------------------------------------------------ */

describe('gereedschapsbalk - kleur, dikte en dekking', () => {
  it('kiest een kleur', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(screen.getByTitle('annotationToolbar.colors.blue'));

    expect(keuze()).toContain('#2563EB');
  });

  it('laat aan de rand zien welke kleur aanstaat', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    const groen = screen.getByTitle('annotationToolbar.colors.green');

    expect(groen.style.border).not.toContain('3px');

    await gebruiker.click(groen);

    expect(groen.style.border).toBe('3px solid rgb(59, 130, 246)');
  });

  it('kiest een lijndikte en toont die in pixels', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    expect(screen.getByText('2px')).toBeInTheDocument();

    await gebruiker.click(screen.getByTitle('annotationToolbar.strokeWidth.thick'));

    expect(keuze()).toContain('| 8 |');
    expect(screen.getByText('8px')).toBeInTheDocument();
  });

  it('schuift de dekking en toont die in procenten', () => {
    render(<Balk />);
    const schuif = screen.getByRole('slider');

    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.change(schuif, { target: { value: '0.4' } });

    expect(keuze()).toContain('0.4');
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Ongedaan maken, opnieuw, wissen                                     */
/* ------------------------------------------------------------------ */

describe('gereedschapsbalk - ongedaan maken en wissen', () => {
  it('houdt ongedaan en opnieuw uit zolang er niets te herstellen valt', () => {
    render(<Balk />);

    expect(screen.getByRole('button', { name: 'annotationToolbar.undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'annotationToolbar.redo' })).toBeDisabled();
  });

  it('maakt ongedaan en doet opnieuw met de knoppen', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk kanOngedaan kanOpnieuw />);

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.undo' }));
    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.redo' }));

    expect(ongedaan).toBe(1);
    expect(opnieuw).toBe(1);
  });

  it('vraagt eerst na voordat het hele blad gewist wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.clearAll' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('annotationToolbar.clearConfirm')).toBeInTheDocument();
    // Nog niets gewist zolang er niet bevestigd is.
    expect(gewist).toBe(0);

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(gewist).toBe(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('wist niets als de vraag weggeklikt wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.clearAll' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(gewist).toBe(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Stempels                                                            */
/* ------------------------------------------------------------------ */

describe('gereedschapsbalk - stempels', () => {
  /** Open de stempellade. */
  async function opent(gebruiker: ReturnType<typeof userEvent.setup>) {
    await gebruiker.click(gereedschapsknop('stamp'));
  }

  it('toont eerst de dynamiekstempels', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    expect(screen.getByTitle('ff')).toBeInTheDocument();
    expect(screen.getByTitle('pp')).toBeInTheDocument();
    expect(screen.queryByTitle('rit.')).not.toBeInTheDocument();
  });

  it('wisselt van stempelsoort met de tabbladen', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.stampCategories.tempo' }));

    expect(screen.getByTitle('rit.')).toBeInTheDocument();
    expect(screen.queryByTitle('ff')).not.toBeInTheDocument();
  });

  it('meldt het als er in een soort niets te stempelen valt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.stampCategories.navigation' }));

    expect(screen.getByText('annotationToolbar.noStampsInCategory')).toBeInTheDocument();
  });

  it('zoekt door alle soorten heen, ook buiten het open tabblad', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    // 'rit.' staat onder tempo terwijl dynamiek openstaat.
    await gebruiker.type(screen.getByPlaceholderText('annotationToolbar.searchStamps'), 'rit');

    expect(screen.getByTitle('rit.')).toBeInTheDocument();
    expect(screen.queryByTitle('ff')).not.toBeInTheDocument();
    // Tijdens het zoeken zijn de tabbladen weg - ze zouden toch niets doen.
    expect(screen.queryByRole('button', { name: 'annotationToolbar.stampCategories.tempo' })).not.toBeInTheDocument();
  });

  it('zoekt ook op de naam van de soort', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('annotationToolbar.searchStamps'), 'tempo');

    expect(screen.getByTitle('rit.')).toBeInTheDocument();
    expect(screen.getByTitle('Fermate')).toBeInTheDocument();
  });

  it('meldt het als er niets gevonden wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('annotationToolbar.searchStamps'), 'sousafoon');

    expect(screen.getByText('annotationToolbar.noStampsInCategory')).toBeInTheDocument();
  });

  it('kiest een stempel', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    await gebruiker.click(screen.getByTitle('pp'));

    expect(keuze()).toContain('stamp-pp');
  });

  it('toont een tekststempel als tekst en een tekening als tekening', async () => {
    const gebruiker = userEvent.setup();
    render(<Balk />);
    await opent(gebruiker);

    // 'ff' komt uit het <text>-element van het stempel, niet uit de naam.
    expect(screen.getByTitle('ff')).toHaveTextContent('ff');
    expect(screen.getByTitle('ff').querySelector('svg')).toBeNull();

    await gebruiker.click(screen.getByRole('button', { name: 'annotationToolbar.stampCategories.tempo' }));

    // De fermate is een tekening en wordt als svg neergezet.
    expect(screen.getByTitle('Fermate').querySelector('svg')).not.toBeNull();
  });

  it('laat de lade dicht zolang het stempelgereedschap niet aanstaat', () => {
    // De lade hoort bij het gereedschap: met de gum aan is er niets te kiezen.
    render(<Balk beginGereedschap="eraser" />);

    expect(screen.queryByPlaceholderText('annotationToolbar.searchStamps')).not.toBeInTheDocument();
  });
});
