/**
 * Zaalplattegrond: stoelen kiezen en loslaten.
 *
 * SeatSelector tekent de zaal als SVG. Elke stoel is een `g` met rol `button`,
 * dus alles wat een bezoeker doet - kiezen, loslaten, langs de stoelen lopen
 * met de pijltjestoetsen - is hier te bereiken zonder aan de tekening zelf te
 * sleutelen. Het slepen en het inzoomen met het wiel worden niet nagebootst:
 * dat hangt aan muisposities die jsdom niet kent, en een test die dat met
 * verzonnen afmetingen naspeelt breekt bij de eerste opmaakwijziging. De
 * toestand eromheen (zoomknoppen, teller, totaalprijs, samenvatting) wordt wel
 * getest.
 *
 * De aanleiding voor het bestand: aan de serverkant bleek dat twee mensen op
 * dezelfde stoel konden komen. De server weigert die stoel nu. Wat doet dit
 * scherm als een stoel die de bezoeker al gekozen had intussen verkocht
 * blijkt? Zie 'server weigert een bezette stoel'.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatSelector from '../SeatSelector';
import type { VenueLayout, VenueSeat, SeatStatus, SeatType } from '../SeatSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // De sleutel plus de ingevulde waarden, zodat twee stoelen niet hetzelfde
    // toegankelijke label krijgen.
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De echte hulpfunctie trekt de volledige i18n-opzet mee; hier is alleen de
// landinstelling van belang voor het bedrag.
vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

// Intl zet tussen het euroteken en het bedrag een vaste spatie (U+00A0). Die
// overleeft het knippen en plakken in een verwachting niet, dus wordt hij hier
// als 'willekeurige witruimte' gezocht.
function bedrag(waarde: number): RegExp {
  const tekst = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(waarde);
  return new RegExp(tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u00a0/g, '\\s'));
}

function maakStoel(id: string, rij: string, nummer: string, extra: Partial<VenueSeat> = {}): VenueSeat {
  return {
    id,
    row: rij,
    number: nummer,
    x: 0,
    y: 0,
    sectionId: 'vak-1',
    type: 'regular' as SeatType,
    status: 'available' as SeatStatus,
    price: 12,
    ...extra,
  };
}

const indeling: VenueLayout = {
  id: 'indeling-1',
  name: 'Grote zaal',
  width: 400,
  height: 300,
  sections: [{ id: 'vak-1', name: 'Parterre', labelX: 200, labelY: 20 }],
  seats: [
    maakStoel('a1', 'A', '1'),
    maakStoel('a2', 'A', '2', { status: 'sold' }),
    maakStoel('a3', 'A', '3', { type: 'wheelchair', price: 10 }),
    maakStoel('b1', 'B', '1', { type: 'vip', price: 25 }),
    maakStoel('b2', 'B', '2', { status: 'reserved' }),
  ],
  stageArea: { x: 100, y: 0, width: 200, height: 40 },
};

const legeIndeling: VenueLayout = {
  id: 'indeling-leeg',
  name: 'Nog niet ingedeeld',
  width: 400,
  height: 300,
  sections: [],
  seats: [],
};

/** Alle stoelen op de plattegrond, in tekenvolgorde. */
function alleStoelen(): SVGGElement[] {
  return Array.from(document.querySelectorAll<SVGGElement>('g[role="button"]'));
}

/** De stoel met dit rij- en stoelnummer. */
function stoel(rij: string, nummer: string): SVGGElement {
  const gevonden = alleStoelen().find((element) =>
    (element.getAttribute('aria-label') ?? '').startsWith(`seatSelector.seatAriaLabel ${rij} ${nummer} `),
  );
  if (!gevonden) throw new Error(`Stoel ${rij}${nummer} staat niet op de plattegrond`);
  return gevonden;
}

describe('SeatSelector - de plattegrond', () => {
  // Getypeerd naar de prop zelf; ReturnType<typeof vi.fn> is te ruim en past
  // niet op onSeatSelect.
  let kiesStoelen: Mock<(seatIds: string[]) => void>;

  beforeEach(() => {
    kiesStoelen = vi.fn<(seatIds: string[]) => void>();
  });

  it('tekent evenveel stoelen als de indeling zegt', () => {
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    expect(alleStoelen()).toHaveLength(indeling.seats.length);
    // Het podium en de naam van het vak horen er ook te staan.
    expect(screen.getByText('Parterre')).toBeInTheDocument();
    expect(screen.getByText('seatSelector.stage')).toBeInTheDocument();
  });

  it('toont in de legenda alleen de stoelsoorten die in de zaal voorkomen', () => {
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    expect(screen.getByText('seatSelector.seatTypes.regular')).toBeInTheDocument();
    expect(screen.getByText('seatSelector.seatTypes.wheelchair')).toBeInTheDocument();
    expect(screen.getByText('seatSelector.seatTypes.vip')).toBeInTheDocument();
    expect(screen.queryByText('seatSelector.seatTypes.companion')).not.toBeInTheDocument();
  });

  it('toont een lege indeling zonder stoelen en zonder samenvatting', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={legeIndeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    expect(alleStoelen()).toHaveLength(0);
    expect(screen.getByText('seatSelector.selectedCount 0 10')).toBeInTheDocument();
    expect(screen.queryByText('seatSelector.selectedSeats')).not.toBeInTheDocument();

    // Pijltjes en Enter mogen op een lege zaal niets uithalen.
    const plattegrond = screen.getByRole('application');
    plattegrond.focus();
    await gebruiker.keyboard('{ArrowRight}{Enter}');
    expect(kiesStoelen).not.toHaveBeenCalled();
  });
});

describe('SeatSelector - kiezen en loslaten', () => {
  // Getypeerd naar de prop zelf; ReturnType<typeof vi.fn> is te ruim en past
  // niet op onSeatSelect.
  let kiesStoelen: Mock<(seatIds: string[]) => void>;

  beforeEach(() => {
    kiesStoelen = vi.fn<(seatIds: string[]) => void>();
  });

  it('kiest een vrije stoel en laat hem daarna weer los', async () => {
    const gebruiker = userEvent.setup();
    const { rerender } = render(
      <SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />,
    );

    await gebruiker.click(stoel('A', '1'));
    expect(kiesStoelen).toHaveBeenCalledWith(['a1']);

    // De ouder geeft de keuze terug aan het scherm.
    rerender(<SeatSelector concertId="c1" layout={indeling} selectedSeats={['a1']} onSeatSelect={kiesStoelen} />);
    expect(stoel('A', '1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('seatSelector.selectedCount 1 10')).toBeInTheDocument();

    await gebruiker.click(stoel('A', '1'));
    expect(kiesStoelen).toHaveBeenLastCalledWith([]);
  });

  it('laat een verkochte stoel niet kiezen', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    const verkocht = stoel('A', '2');
    expect(verkocht).toHaveAttribute('aria-disabled', 'true');
    expect(verkocht).toHaveAttribute('tabindex', '-1');

    await gebruiker.click(verkocht);
    expect(kiesStoelen).not.toHaveBeenCalled();
  });

  it('laat een gereserveerde stoel niet kiezen', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    await gebruiker.click(stoel('B', '2'));
    expect(kiesStoelen).not.toHaveBeenCalled();
  });

  it('kiest niet meer stoelen dan het maximum toestaat', async () => {
    const gebruiker = userEvent.setup();
    render(
      <SeatSelector
        concertId="c1"
        layout={indeling}
        selectedSeats={['a1', 'a3']}
        onSeatSelect={kiesStoelen}
        maxSeats={2}
      />,
    );

    await gebruiker.click(stoel('B', '1'));
    expect(kiesStoelen).not.toHaveBeenCalled();

    // Een al gekozen stoel loslaten mag wel; dat maakt juist plaats.
    await gebruiker.click(stoel('A', '1'));
    expect(kiesStoelen).toHaveBeenCalledWith(['a3']);
  });

  it('toont de gekozen stoelen met hun prijs en het totaal', () => {
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={['a3', 'b1']} onSeatSelect={kiesStoelen} />);

    expect(screen.getByText('seatSelector.selectedSeats')).toBeInTheDocument();
    expect(screen.getAllByText(bedrag(10)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(bedrag(25)).length).toBeGreaterThan(0);
    // Het totaal staat op twee plekken: in de balk bovenaan en onder de
    // samenvatting.
    expect(screen.getAllByText(bedrag(35))).toHaveLength(2);
  });

  it('haalt een stoel uit de samenvatting weg met het kruisje', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={['a1', 'b1']} onSeatSelect={kiesStoelen} />);

    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.removeSeat A 1' }));
    expect(kiesStoelen).toHaveBeenCalledWith(['b1']);
  });
});

describe('SeatSelector - server weigert een bezette stoel', () => {
  /**
   * BEWIJS. De server bewaakte alleen dat iemand niet twee plekken kreeg, niet
   * dat een plek maar één keer vergeven werd; dat is aan de serverkant
   * gerepareerd. Gevolg voor dit scherm: een stoel die de bezoeker al gekozen
   * had, kan bij het afrekenen alsnog als verkocht terugkomen. Die stoel stond
   * dan nog in zijn mandje, telde mee in het totaal - en was niet meer los te
   * laten, want `handleSeatClick` keerde bij status 'sold' meteen om, nog
   * vóór het loslaten. Zowel de stoel op de plattegrond als het kruisje in de
   * samenvatting deden niets meer.
   *
   * Zonder de reparatie in SeatSelector.tsx (eerst kijken of de stoel al
   * gekozen is, dan pas de status bewaken) falen de eerste twee tests
   * hieronder: onSeatSelect wordt daar niet aangeroepen. De derde is geen
   * bewijs maar een wacht - die blijft ook op de oude code groen en legt vast
   * dat de reparatie de deur niet te ver openzet.
   */
  const bezetteIndeling: VenueLayout = {
    ...indeling,
    seats: indeling.seats.map((s) => (s.id === 'a1' ? { ...s, status: 'sold' as SeatStatus } : s)),
  };

  it('laat een gekozen stoel los die intussen verkocht blijkt', async () => {
    const gebruiker = userEvent.setup();
    const kiesStoelen = vi.fn<(seatIds: string[]) => void>();
    render(
      <SeatSelector concertId="c1" layout={bezetteIndeling} selectedSeats={['a1', 'b1']} onSeatSelect={kiesStoelen} />,
    );

    await gebruiker.click(stoel('A', '1'));
    expect(kiesStoelen).toHaveBeenCalledWith(['b1']);
  });

  it('laat het kruisje in de samenvatting ook dan werken', async () => {
    const gebruiker = userEvent.setup();
    const kiesStoelen = vi.fn<(seatIds: string[]) => void>();
    render(
      <SeatSelector concertId="c1" layout={bezetteIndeling} selectedSeats={['a1', 'b1']} onSeatSelect={kiesStoelen} />,
    );

    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.removeSeat A 1' }));
    expect(kiesStoelen).toHaveBeenCalledWith(['b1']);
  });

  it("kiest zo'n stoel niet opnieuw nadat hij is losgelaten", async () => {
    const gebruiker = userEvent.setup();
    const kiesStoelen = vi.fn<(seatIds: string[]) => void>();
    render(<SeatSelector concertId="c1" layout={bezetteIndeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    await gebruiker.click(stoel('A', '1'));
    expect(kiesStoelen).not.toHaveBeenCalled();
  });
});

describe('SeatSelector - toelichting bij aanwijzen', () => {
  it('toont rij, nummer, soort en prijs van de aangewezen stoel', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={vi.fn()} />);

    await gebruiker.hover(stoel('B', '1'));

    const toelichting = screen.getByRole('tooltip');
    expect(toelichting).toHaveTextContent('seatSelector.rowLabel B');
    expect(toelichting).toHaveTextContent('seatSelector.seatLabel 1');
    expect(toelichting).toHaveTextContent('seatSelector.seatTypes.vip');
    expect(toelichting).toHaveTextContent(bedrag(25));

    await gebruiker.unhover(stoel('B', '1'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('meldt bij een verkochte stoel dat hij niet meer vrij is', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={vi.fn()} />);

    await gebruiker.hover(stoel('A', '2'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.status.sold');
  });

  it('meldt bij een gekozen stoel dat hij van de bezoeker is', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={['a1']} onSeatSelect={vi.fn()} />);

    await gebruiker.hover(stoel('A', '1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.statusSelected');
  });
});

describe('SeatSelector - toetsenbord', () => {
  it('loopt met de pijltjes langs de vrije stoelen en kiest met Enter', async () => {
    const gebruiker = userEvent.setup();
    const kiesStoelen = vi.fn<(seatIds: string[]) => void>();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    const plattegrond = screen.getByRole('application');
    plattegrond.focus();

    // Verkochte en gereserveerde stoelen slaat hij over: a1, a3, b1.
    await gebruiker.keyboard('{ArrowRight}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.seatLabel 1');

    await gebruiker.keyboard('{ArrowRight}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.seatLabel 3');

    await gebruiker.keyboard('{Enter}');
    expect(kiesStoelen).toHaveBeenCalledWith(['a3']);
  });

  it('springt met End naar de laatste en met Home naar de eerste vrije stoel', async () => {
    const gebruiker = userEvent.setup();
    const kiesStoelen = vi.fn<(seatIds: string[]) => void>();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={kiesStoelen} />);

    screen.getByRole('application').focus();

    await gebruiker.keyboard('{End}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.rowLabel B');

    await gebruiker.keyboard('{Home}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.rowLabel A');

    await gebruiker.keyboard('{Enter}');
    expect(kiesStoelen).toHaveBeenCalledWith(['a1']);
  });

  it('loopt met een pijltje terug om naar de laatste vrije stoel', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={vi.fn()} />);

    screen.getByRole('application').focus();
    await gebruiker.keyboard('{ArrowUp}');

    expect(screen.getByRole('tooltip')).toHaveTextContent('seatSelector.seatTypes.vip');
  });
});

describe('SeatSelector - zoomen', () => {
  it('zoomt in en uit en zet de weergave weer op honderd procent', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={vi.fn()} />);

    expect(screen.getByText('100%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.zoomIn' }));
    expect(screen.getByText('110%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.zoomOut' }));
    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.zoomOut' }));
    expect(screen.getByText('90%')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'seatSelector.resetView' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('zet de uitzoomknop uit op de kleinste stand', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatSelector concertId="c1" layout={indeling} selectedSeats={[]} onSeatSelect={vi.fn()} />);

    const uitzoomen = screen.getByRole('button', { name: 'seatSelector.zoomOut' });
    // Zes klikken voor vijf stappen: 1 - 6 x 0,1 komt in drijvende komma net
    // niet op 0,5 uit, dus de knop staat op de laatste stap nog één klik aan.
    for (let stap = 0; stap < 6; stap++) {
      await gebruiker.click(uitzoomen);
    }

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(uitzoomen).toBeDisabled();
  });
});
