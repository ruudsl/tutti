/**
 * Het tekendoek van de podiumindeling: wat de gebruiker erop doet.
 *
 * StageCanvas.tsx tekent het podium als een SVG en vangt alle handelingen op:
 * een stoel neerzetten, hem aanklikken, verslepen, verplaatsen met de
 * pijltjestoetsen en weer weggooien. Het bestand was nooit getest.
 *
 * TWEE DINGEN OVER JSDOM, ZODAT DE KEUZES HIERONDER TE VOLGEN ZIJN.
 *
 * 1. jsdom rekent geen opmaak uit; `getBoundingClientRect()` geeft overal
 *    nullen. Het doek rekent schermpunten om met
 *    `(clientX - rect.left) / zoom`, en met een nulrechthoek is dat gewoon
 *    `clientX / zoom`. Een klik op clientX 107 komt dus op doekpunt 107 uit.
 *    Dat is geen truc en er wordt hier niets aan `getBoundingClientRect`
 *    gesleuteld - het is de rekensom van het doek, met de enige rechthoek die
 *    jsdom kent.
 *
 * 2. Slepen gaat wél, en zonder kunstgrepen: `mousedown` op een element,
 *    `mousemove` over het doek en `mouseup` zijn drie gewone gebeurtenissen
 *    met muiscoördinaten erin. Wat niet getest wordt is hoe het er tijdens het
 *    slepen uitziet, want daar komt echte opmaak bij kijken.
 *
 * De tests draaien tegen een kleine schil (`Podium` hieronder) die de indeling
 * en de selectie in state bewaart, precies zoals StageDesigner dat doet. Zonder
 * die schil zou het doek zijn eigen wijzigingen nooit terugzien en zou geen
 * enkele handeling na de eerste nog kloppen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import StageCanvas from '../StageCanvas';
import type { StageLayoutData } from '../../types';

// De terugvalwaarde is wat de gebruiker in het Nederlands te zien krijgt, dus
// die wordt hier gebruikt waar hij er is. Zo staat er in de verwachtingen
// hieronder 'VOORKANT (PUBLIEK)' en niet 'stageDesigner.front'.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string, terugval?: string) => terugval ?? sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

type Gereedschap = 'select' | 'chair' | 'stand' | 'conductor' | 'piano' | 'percussion' | 'rect' | 'circle' | 'text';

const LEEG: StageLayoutData = { positions: [], shapes: [], sections: [] };

/** De laatste indeling en selectie die het doek doorgaf. */
let laatsteData: StageLayoutData = LEEG;
let laatsteSelectie: string[] = [];

interface PodiumProps {
  begin?: StageLayoutData;
  gereedschap?: Gereedschap;
  raster?: boolean;
  zoom?: number;
  alleenLezen?: boolean;
  sectie?: string;
  /** Zet een gewoon tekstveld naast het doek, zoals de eigenschappenbalk dat doet. */
  metTekstveld?: boolean;
}

function Podium({
  begin = LEEG,
  gereedschap = 'select',
  raster = true,
  zoom = 1,
  alleenLezen = false,
  sectie,
  metTekstveld = false,
}: PodiumProps) {
  const [data, setData] = useState<StageLayoutData>(begin);
  const [selectie, setSelectie] = useState<string[]>([]);

  return (
    <>
      {metTekstveld && <input aria-label="Notitie" defaultValue="abc" />}
      <StageCanvas
        width={400}
        height={300}
        layoutData={data}
        selectedIds={selectie}
        tool={gereedschap}
        gridSnap={raster}
        zoom={zoom}
        currentSection={sectie}
        readOnly={alleenLezen}
        onLayoutChange={(nieuw) => {
          laatsteData = nieuw;
          setData(nieuw);
        }}
        onSelectionChange={(ids) => {
          laatsteSelectie = ids;
          setSelectie(ids);
        }}
      />
    </>
  );
}

/** Het tekendoek zelf. Het heeft geen rol, dus het is alleen zo te pakken. */
function doek(): SVGSVGElement {
  const svg = document.querySelector('svg');
  if (!svg) throw new Error('geen tekendoek gevonden');
  return svg as unknown as SVGSVGElement;
}

function stoel(id: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return { id, x, y, type: 'chair' as const, rotation: 0, ...extra };
}

beforeEach(() => {
  laatsteData = LEEG;
  laatsteSelectie = [];
});

describe('podiumdoek - elementen neerzetten', () => {
  it('toont een leeg podium met de voorkant naar het publiek', () => {
    render(<Podium />);

    expect(screen.getByText('VOORKANT (PUBLIEK)')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('zet een stoel neer op de plek waar de gebruiker klikt', () => {
    render(<Podium gereedschap="chair" />);

    fireEvent.click(doek(), { clientX: 100, clientY: 60 });

    expect(laatsteData.positions).toHaveLength(1);
    expect(laatsteData.positions[0]).toMatchObject({ type: 'chair', x: 100, y: 60, rotation: 0 });
    // De nieuwe stoel is meteen geselecteerd, zodat de eigenschappenbalk hem toont.
    expect(laatsteSelectie).toEqual([laatsteData.positions[0].id]);
    expect(screen.getByRole('button', { name: 'chair' })).toBeInTheDocument();
  });

  it('schuift een klik naast het raster naar het dichtstbijzijnde rasterpunt', () => {
    render(<Podium gereedschap="chair" />);

    fireEvent.click(doek(), { clientX: 107, clientY: 51 });

    // Rasterstap 20: 107 hoort bij 100, 51 bij 60.
    expect(laatsteData.positions[0]).toMatchObject({ x: 100, y: 60 });
  });

  it('laat de stoel precies staan waar geklikt is als het raster uit staat', () => {
    render(<Podium gereedschap="chair" raster={false} />);

    fireEvent.click(doek(), { clientX: 107, clientY: 51 });

    expect(laatsteData.positions[0]).toMatchObject({ x: 107, y: 51 });
  });

  it('rekent de zoomfactor mee bij het neerzetten', () => {
    render(<Podium gereedschap="chair" zoom={2} />);

    fireEvent.click(doek(), { clientX: 200, clientY: 120 });

    // Op tweevoudige vergroting hoort schermpunt 200 bij doekpunt 100.
    expect(laatsteData.positions[0]).toMatchObject({ x: 100, y: 60 });
  });

  it('geeft de nieuwe stoel de sectie die op dat moment gekozen is', () => {
    render(<Podium gereedschap="chair" sectie="s1" />);

    fireEvent.click(doek(), { clientX: 100, clientY: 100 });

    expect(laatsteData.positions[0].section).toBe('s1');
  });

  it.each([
    ['stand' as const, 'stand'],
    ['conductor' as const, 'conductor'],
    ['piano' as const, 'piano'],
    ['percussion' as const, 'percussion'],
  ])('zet een %s neer met het bijbehorende gereedschap', (gereedschap, soort) => {
    render(<Podium gereedschap={gereedschap} />);

    fireEvent.click(doek(), { clientX: 100, clientY: 100 });

    expect(laatsteData.positions[0].type).toBe(soort);
    expect(screen.getByRole('button', { name: soort })).toBeInTheDocument();
  });

  it('zet een rechthoek neer met een standaardmaat', () => {
    render(<Podium gereedschap="rect" />);

    fireEvent.click(doek(), { clientX: 40, clientY: 40 });

    expect(laatsteData.shapes[0]).toMatchObject({ type: 'rect', width: 100, height: 60, fill: '#e0e0e0' });
    expect(laatsteData.positions).toHaveLength(0);
  });

  it('zet een cirkel neer met een straal', () => {
    render(<Podium gereedschap="circle" />);

    fireEvent.click(doek(), { clientX: 40, clientY: 40 });

    expect(laatsteData.shapes[0]).toMatchObject({ type: 'circle', radius: 50 });
    expect(laatsteData.shapes[0].width).toBeUndefined();
  });

  it('zet een tekstvorm neer met een beginlabel', () => {
    render(<Podium gereedschap="text" />);

    fireEvent.click(doek(), { clientX: 40, clientY: 40 });

    expect(laatsteData.shapes[0]).toMatchObject({ type: 'text', label: 'Label', fontSize: 16 });
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('zet met een plaatsgereedschap ook een element neer als er op een bestaand element geklikt wordt', () => {
    render(<Podium begin={{ ...LEEG, positions: [stoel('p1', 100, 100, { label: 'Vl1-1' })] }} gereedschap="chair" />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }), { clientX: 200, clientY: 200 });

    // De klik plaatst, hij selecteert niet: dat is waar de opvangfase voor is.
    expect(laatsteData.positions).toHaveLength(2);
    expect(laatsteData.positions[1]).toMatchObject({ x: 200, y: 200 });
  });
});

describe('podiumdoek - selecteren', () => {
  const tweeStoelen: StageLayoutData = {
    ...LEEG,
    positions: [stoel('p1', 100, 100, { label: 'Vl1-1' }), stoel('p2', 160, 100, { label: 'Vl1-2' })],
  };

  it('selecteert een element bij een klik', () => {
    render(<Podium begin={tweeStoelen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));

    expect(laatsteSelectie).toEqual(['p1']);
  });

  it('breidt de selectie uit met shift en haalt er met shift weer een af', () => {
    render(<Podium begin={tweeStoelen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vl1-2' }), { shiftKey: true });
    expect(laatsteSelectie).toEqual(['p1', 'p2']);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }), { shiftKey: true });
    expect(laatsteSelectie).toEqual(['p2']);
  });

  it('heft de selectie op bij een klik op de achtergrond', () => {
    const { container } = render(<Podium begin={tweeStoelen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    expect(laatsteSelectie).toEqual(['p1']);

    fireEvent.click(container.querySelector('.stage-background')!);

    expect(laatsteSelectie).toEqual([]);
  });

  it('tekent een geselecteerd element met een dikkere rand', () => {
    render(<Podium begin={tweeStoelen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));

    const rand = screen.getByRole('button', { name: 'Vl1-1' }).querySelector('rect')!;
    expect(rand.getAttribute('stroke')).toBe('#1976D2');
    expect(rand.getAttribute('stroke-width')).toBe('3');
  });

  it('geeft een stoel de kleur van zijn sectie, en grijs als hij er geen heeft', () => {
    render(
      <Podium
        begin={{
          positions: [
            stoel('p1', 100, 100, { label: 'In sectie', section: 's1' }),
            stoel('p2', 160, 100, { label: 'Los' }),
          ],
          shapes: [],
          sections: [{ id: 's1', name: 'Violen 1', color: '#ff0000' }],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'In sectie' }).querySelector('rect')!.getAttribute('fill')).toBe(
      '#ff0000',
    );
    expect(screen.getByRole('button', { name: 'Los' }).querySelector('rect')!.getAttribute('fill')).toBe('#cccccc');
  });
});

describe('podiumdoek - verplaatsen en verwijderen', () => {
  const eenStoel: StageLayoutData = { ...LEEG, positions: [stoel('p1', 100, 100, { label: 'Vl1-1' })] };

  it('sleept een element naar een nieuwe plek', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Vl1-1' }), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(doek(), { clientX: 160, clientY: 140 });
    fireEvent.mouseUp(doek());

    expect(laatsteData.positions[0]).toMatchObject({ x: 160, y: 140 });
  });

  it('laat de indeling met rust als de muis wel ingedrukt maar niet verplaatst wordt', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Vl1-1' }), { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(doek());

    // Wel geselecteerd, maar de indeling is niet gewijzigd.
    expect(laatsteSelectie).toEqual(['p1']);
    expect(laatsteData).toBe(LEEG);
  });

  it('rondt de sleep af als de muis het doek verlaat', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Vl1-1' }), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(doek(), { clientX: 200, clientY: 100 });
    fireEvent.mouseLeave(doek());

    expect(laatsteData.positions[0]).toMatchObject({ x: 200, y: 100 });
  });

  it('verplaatst het geselecteerde element met de pijltjestoetsen', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(laatsteData.positions[0]).toMatchObject({ x: 120, y: 100 });

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(laatsteData.positions[0]).toMatchObject({ x: 120, y: 80 });
  });

  it('neemt kleinere stappen als het raster uit staat', () => {
    render(<Podium begin={eenStoel} raster={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });

    expect(laatsteData.positions[0]).toMatchObject({ x: 95, y: 100 });
  });

  it('verplaatst een element met de pijltjestoetsen precies één stap, ook al luistert het venster mee', () => {
    render(<Podium begin={eenStoel} />);

    // De toetsaanslag op het element zelf mag niet óók door de vensterluisteraar
    // afgehandeld worden; dan zou de stoel twee rasterstappen ver springen.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Vl1-1' }), { key: 'ArrowDown' });

    expect(laatsteData.positions[0]).toMatchObject({ x: 100, y: 120 });
  });

  it('pakt en laat een element los met Enter', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Vl1-1' }), { key: 'Enter' });
    expect(laatsteSelectie).toEqual(['p1']);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Vl1-1' }), { key: 'Enter' });
    expect(laatsteSelectie).toEqual([]);
  });

  it('verwijdert de geselecteerde elementen met Delete', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    fireEvent.keyDown(document.body, { key: 'Delete' });

    expect(laatsteData.positions).toHaveLength(0);
    expect(laatsteSelectie).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Vl1-1' })).not.toBeInTheDocument();
  });

  it('verwijdert ook vormen met Backspace', () => {
    render(
      <Podium
        begin={{ ...LEEG, shapes: [{ id: 'v1', type: 'rect', x: 0, y: 0, width: 100, height: 60, label: 'Vleugel' }] }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vleugel' }));
    fireEvent.keyDown(document.body, { key: 'Backspace' });

    expect(laatsteData.shapes).toHaveLength(0);
  });

  it('verwijdert niets zolang er niets geselecteerd is', () => {
    render(<Podium begin={eenStoel} />);

    fireEvent.keyDown(document.body, { key: 'Delete' });

    expect(laatsteData).toBe(LEEG);
    expect(screen.getByRole('button', { name: 'Vl1-1' })).toBeInTheDocument();
  });
});

/**
 * BEWIJS - het podium luisterde mee met de toetsenbordinvoer van formulieren.
 *
 * Het doek hangt een luisteraar aan `window` voor Delete, Backspace en de
 * pijltjestoetsen. Die luisteraar keek niet waar de toetsaanslag vandaan kwam.
 * Naast het doek staat de eigenschappenbalk met tekstvelden erin - naam van de
 * indeling, label van de stoel - en wie daar een typefout wegveegde met
 * Backspace, terwijl er nog een stoel geselecteerd stond, zag die stoel van het
 * podium verdwijnen. Precies hetzelfde gold voor de pijltjestoetsen: door de
 * tekst lopen verschoof de stoel.
 *
 * De reparatie staat in StageCanvas.tsx: een toetsaanslag die uit een
 * invoerveld komt hoort bij dat veld en niet bij het podium.
 *
 * Aangetoond: met StageCanvas.tsx teruggezet op HEAD (`git checkout HEAD --
 * src/components/StageCanvas.tsx`, alleen dat bestand) vielen deze twee tests
 * om met
 *   'verwijdert geen element als de gebruiker in een tekstveld typt'
 *      -> de stoel was uit het scherm verdwenen
 *   'verplaatst geen element als de gebruiker door een tekstveld loopt'
 *      -> transform stond op translate(80, 100) in plaats van translate(100, 100)
 * Daarna is het gerepareerde bestand teruggezet.
 */
describe('podiumdoek - toetsenbordinvoer van formulieren', () => {
  const eenStoel: StageLayoutData = { ...LEEG, positions: [stoel('p1', 100, 100, { label: 'Vl1-1' })] };

  it('verwijdert geen element als de gebruiker in een tekstveld typt', async () => {
    const gebruiker = userEvent.setup();
    render(<Podium begin={eenStoel} metTekstveld />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    await gebruiker.type(screen.getByLabelText('Notitie'), '{Backspace}');

    // De stoel staat er nog, en het doek heeft geen wijziging gemeld.
    expect(screen.getByRole('button', { name: 'Vl1-1' })).toBeInTheDocument();
    expect(laatsteData).toBe(LEEG);
    // En het veld doet wél wat de gebruiker vroeg.
    expect(screen.getByLabelText('Notitie')).toHaveValue('ab');
  });

  it('verplaatst geen element als de gebruiker door een tekstveld loopt', async () => {
    const gebruiker = userEvent.setup();
    render(<Podium begin={eenStoel} metTekstveld />);

    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));
    await gebruiker.type(screen.getByLabelText('Notitie'), '{ArrowLeft}');

    expect(screen.getByRole('button', { name: 'Vl1-1' })).toHaveAttribute('transform', 'translate(100, 100) rotate(0)');
    expect(laatsteData).toBe(LEEG);
  });
});

describe('podiumdoek - alleen lezen', () => {
  const eenStoel: StageLayoutData = { ...LEEG, positions: [stoel('p1', 100, 100, { label: 'Vl1-1' })] };

  it('zet niets neer en selecteert niets', () => {
    render(<Podium begin={eenStoel} gereedschap="chair" alleenLezen />);

    fireEvent.click(doek(), { clientX: 40, clientY: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'Vl1-1' }));

    expect(laatsteData).toBe(LEEG);
    expect(laatsteSelectie).toEqual([]);
  });

  it('verwijdert niets met Delete', () => {
    render(<Podium begin={eenStoel} alleenLezen />);

    fireEvent.keyDown(document.body, { key: 'Delete' });

    expect(laatsteData).toBe(LEEG);
    expect(screen.getByRole('button', { name: 'Vl1-1' })).toBeInTheDocument();
  });

  it('haalt de elementen uit de tabvolgorde', () => {
    render(<Podium begin={eenStoel} alleenLezen />);

    expect(screen.getByRole('button', { name: 'Vl1-1' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('podiumdoek - raster', () => {
  it('tekent rasterlijnen als het raster aan staat en laat ze weg als het uit staat', () => {
    const { container, rerender } = render(<Podium />);

    expect(container.querySelector('g.grid')).toBeInTheDocument();

    rerender(<Podium raster={false} />);

    expect(container.querySelector('g.grid')).not.toBeInTheDocument();
  });
});
