/**
 * Bladeren door een muzieklijst: pijlen, stippen, teller en toetsenbord.
 *
 * Dit component had geen enkele test. Het is bedoeld voor een telefoon en
 * reageert op veegbewegingen, maar het schuift ook met twee pijlknoppen, een
 * rij stippen onderaan en de pijltjestoetsen. Dat laatste is het deel dat op
 * een gewoon scherm bediend wordt, en juist dat was nergens vastgelegd.
 *
 * De veegbeweging zelf is hier ook getest, maar dan op wat de gebruiker
 * overhoudt: welk onderdeel actief is nadat er geveegd is. De verschuiving
 * tijdens het vegen wordt in beeldpunten omgerekend met `offsetWidth`, en die
 * is in jsdom altijd nul. Aan die waarde gaan sleutelen test niet het
 * component maar de nabootsing; het eindresultaat van een veeg is wél echt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwipeableMusicList, MusicCard, type MusicItem } from '../SwipeableMusicList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const STUKKEN: MusicItem[] = [
  { id: 'stuk-1', title: 'Also sprach Zarathustra', subtitle: 'Strauss', metadata: '3:45' },
  { id: 'stuk-2', title: 'Radetzky Marsch', subtitle: 'Strauss sr.' },
  { id: 'stuk-3', title: 'Bolero', subtitle: 'Ravel' },
];

/** Toon de lijst met een eenvoudige tekstweergave per onderdeel. */
function toon(eigenschappen: Partial<React.ComponentProps<typeof SwipeableMusicList<MusicItem>>> = {}) {
  return render(
    <SwipeableMusicList
      items={STUKKEN}
      renderItem={(item, _index, isActive) => <span>{isActive ? `actief: ${item.title}` : item.title}</span>}
      {...eigenschappen}
    />,
  );
}

/**
 * Boots een horizontale veeg na met echte aanraakgebeurtenissen: neerzetten,
 * bewegen, loslaten. De hook meet alleen `clientX` en de tijd ertussen, dus
 * hier is geen enkele afmeting van het scherm voor nodig.
 */
function veeg(element: Element, vanX: number, naarX: number) {
  fireEvent.touchStart(element, { touches: [{ clientX: vanX, clientY: 0 }] });
  fireEvent.touchMove(element, { touches: [{ clientX: naarX, clientY: 0 }] });
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: naarX, clientY: 0 }] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SwipeableMusicList - bladeren met de knoppen', () => {
  it('begint bij het eerste onderdeel en zegt hoeveel er zijn', () => {
    toon();

    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('gaat met de volgende-knop een onderdeel verder en meldt dat aan de ouder', async () => {
    const gebruiker = userEvent.setup();
    const bijWissel = vi.fn();
    toon({ onItemChange: bijWissel });

    await gebruiker.click(screen.getByRole('button', { name: 'Next item' }));

    expect(screen.getByText('actief: Radetzky Marsch')).toBeInTheDocument();
    expect(bijWissel).toHaveBeenCalledWith(1, STUKKEN[1]);
  });

  it('zet de vorige-knop uit op het eerste onderdeel en de volgende-knop op het laatste', async () => {
    const gebruiker = userEvent.setup();
    toon();

    expect(screen.getByRole('button', { name: 'Previous item' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next item' })).toBeEnabled();

    await gebruiker.click(screen.getByRole('button', { name: 'Next item' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Next item' }));

    expect(screen.getByText('actief: Bolero')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next item' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous item' })).toBeEnabled();
  });

  it('loopt met `loop` van het laatste onderdeel door naar het eerste', async () => {
    const gebruiker = userEvent.setup();
    toon({ loop: true });

    // Terug vanaf het eerste onderdeel komt uit bij het laatste.
    await gebruiker.click(screen.getByRole('button', { name: 'Previous item' }));
    expect(screen.getByText('actief: Bolero')).toBeInTheDocument();

    // En verder vanaf het laatste komt weer uit bij het eerste.
    await gebruiker.click(screen.getByRole('button', { name: 'Next item' }));
    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('springt met een stip rechtstreeks naar dat onderdeel', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getByRole('tab', { name: 'Go to item 3: Bolero' }));

    expect(screen.getByText('actief: Bolero')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Go to item 3: Bolero' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Go to item 1: Also sprach Zarathustra' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('laat pijlen, stippen en teller weg bij één onderdeel', () => {
    toon({ items: [STUKKEN[0]] });

    expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('kan de pijlen en de stippen los uitzetten', () => {
    toon({ showArrows: false, showDots: false });

    expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('meldt een lege lijst in plaats van een leeg scherm', () => {
    toon({ items: [] });

    expect(screen.getByText('No items to display')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();
  });
});

describe('SwipeableMusicList - toetsenbord', () => {
  it('bladert met de pijltjestoetsen vooruit en terug', () => {
    toon();
    const gebied = screen.getByRole('region', { name: 'Music list navigation' });

    fireEvent.keyDown(gebied, { key: 'ArrowRight' });
    expect(screen.getByText('actief: Radetzky Marsch')).toBeInTheDocument();

    fireEvent.keyDown(gebied, { key: 'ArrowLeft' });
    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('blijft staan als er in die richting niets meer is', () => {
    toon();
    const gebied = screen.getByRole('region', { name: 'Music list navigation' });

    fireEvent.keyDown(gebied, { key: 'ArrowLeft' });
    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();

    // Een toets die niets met bladeren te maken heeft laat de lijst met rust.
    fireEvent.keyDown(gebied, { key: 'Enter' });
    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('is als geheel aan te wijzen met de tabtoets', () => {
    toon();

    expect(screen.getByRole('region', { name: 'Music list navigation' })).toHaveAttribute('tabindex', '0');
  });
});

describe('SwipeableMusicList - vegen', () => {
  /** Het omhulsel waar de veegafhandelaars op zitten, is het eerste kind. */
  function veegvlak(): Element {
    const gebied = screen.getByRole('region', { name: 'Music list navigation' });
    return gebied.firstElementChild as Element;
  }

  it('gaat bij vegen naar links een onderdeel verder', () => {
    toon();

    veeg(veegvlak(), 200, 100);

    expect(screen.getByText('actief: Radetzky Marsch')).toBeInTheDocument();
  });

  it('gaat bij vegen naar rechts een onderdeel terug', () => {
    toon({ currentIndex: 2 });
    const bijWissel = vi.fn();
    // Opnieuw, nu met een luisteraar: de gestuurde stand komt van de ouder,
    // dus de wissel is alleen aan de terugmelding te zien.
    render(
      <SwipeableMusicList
        items={STUKKEN}
        currentIndex={2}
        onItemChange={bijWissel}
        renderItem={(item) => <span>{item.title}</span>}
      />,
    );

    const gebieden = screen.getAllByRole('region', { name: 'Music list navigation' });
    veeg(gebieden[1].firstElementChild as Element, 100, 200);

    expect(bijWissel).toHaveBeenCalledWith(1, STUKKEN[1]);
  });

  it('negeert een veeg die de drempel niet haalt', () => {
    toon();

    // Twintig beeldpunten is minder dan de drempel van vijftig.
    veeg(veegvlak(), 200, 180);

    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('doet niets als vegen uitgezet is', () => {
    toon({ enableSwipe: false });

    veeg(veegvlak(), 200, 100);

    expect(screen.getByText('actief: Also sprach Zarathustra')).toBeInTheDocument();
  });

  it('blijft bij een veeg voorbij het einde op het laatste onderdeel staan', () => {
    toon({ currentIndex: undefined });

    veeg(veegvlak(), 200, 100);
    veeg(veegvlak(), 200, 100);
    expect(screen.getByText('actief: Bolero')).toBeInTheDocument();

    // Nog een keer naar links: er is niets meer, dus de lijst blijft staan.
    veeg(veegvlak(), 200, 100);
    expect(screen.getByText('actief: Bolero')).toBeInTheDocument();
  });
});

describe('MusicCard', () => {
  it('toont titel, ondertitel en bijschrift van het stuk', () => {
    render(<MusicCard item={STUKKEN[0]} />);

    expect(screen.getByRole('heading', { name: 'Also sprach Zarathustra' })).toBeInTheDocument();
    expect(screen.getByText('Strauss')).toBeInTheDocument();
    expect(screen.getByText('3:45')).toBeInTheDocument();
  });

  it('toont de knop alleen als er iets te doen valt', async () => {
    const gebruiker = userEvent.setup();
    const { rerender } = render(<MusicCard item={STUKKEN[1]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const bijActie = vi.fn();
    rerender(<MusicCard item={STUKKEN[1]} onAction={bijActie} actionLabel="Openen" />);
    await gebruiker.click(screen.getByRole('button', { name: 'Openen' }));

    expect(bijActie).toHaveBeenCalledTimes(1);
  });

  it('toont de omslag met de titel als alternatieve tekst', () => {
    render(<MusicCard item={{ ...STUKKEN[0], imageUrl: '/omslag.png' }} />);

    expect(screen.getByRole('img', { name: 'Also sprach Zarathustra' })).toHaveAttribute('src', '/omslag.png');
  });

  it('geeft eigen inhoud een plek onder de gegevens van het stuk', () => {
    render(
      <MusicCard item={STUKKEN[2]}>
        <p>Partij ontbreekt</p>
      </MusicCard>,
    );

    expect(screen.getByText('Partij ontbreekt')).toBeInTheDocument();
  });
});
