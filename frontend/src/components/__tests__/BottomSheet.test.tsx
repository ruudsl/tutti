/**
 * Het onderpaneel: een venster dat op de telefoon van onderen omhoog schuift.
 *
 * Het paneel is een modaal venster met drie manieren om eruit te komen: de
 * sluitknop, een tik naast het paneel en Escape. Op de telefoon komt daar het
 * naar beneden vegen bij. Dat vegen loopt via useSwipeGesture, die aan echte
 * touch-gebeurtenissen hangt; die worden hieronder met de hand afgevuurd,
 * want jsdom heeft geen vingers.
 *
 * WAT HIER NIET IN ZIT. Het paneel schuift met een css-animatie omhoog en
 * volgt tijdens het vegen de vinger via `style.transform`. Dat die animatie
 * er goed uitziet valt niet te testen; dat de verschuiving wordt gezet en na
 * een te korte veeg weer op nul komt, wel - dat staat hieronder.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.style.overflow = '';
});

/** De paneelbak zelf. */
function paneel(): HTMLElement {
  return screen.getByRole('dialog');
}

/** Vegen over het paneel: neerzetten, slepen, loslaten. */
function veeg(el: HTMLElement, vanY: number, naarY: number, stappen = 2) {
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: vanY }] });
  for (let i = 1; i <= stappen; i++) {
    const y = vanY + ((naarY - vanY) * i) / stappen;
    fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: y }] });
  }
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: naarY }] });
}

describe('onderpaneel - openen en sluiten', () => {
  it('laat niets zien zolang het dicht is', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Inhoud')).not.toBeInTheDocument();
  });

  it('toont titel, inhoud en voettekst als modaal venster', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" footer={<button>Bevestig</button>}>
        <p>Eine kleine Nachtmusik</p>
      </BottomSheet>,
    );

    const venster = paneel();
    expect(venster).toHaveAttribute('aria-modal', 'true');
    // De titel benoemt het venster voor een schermlezer.
    expect(venster).toHaveAttribute('aria-labelledby', 'bottom-sheet-title');
    expect(screen.getByRole('heading', { name: 'Kies een stuk' })).toHaveAttribute('id', 'bottom-sheet-title');
    expect(screen.getByText('Eine kleine Nachtmusik')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bevestig' })).toBeInTheDocument();
  });

  it('laat de kop weg als er geen titel is, en benoemt zichzelf dan ook niet', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()}>
        <p>Alleen inhoud</p>
      </BottomSheet>,
    );

    expect(paneel()).not.toHaveAttribute('aria-labelledby');
    expect(screen.queryByRole('button', { name: 'Sluiten' })).not.toBeInTheDocument();
    expect(screen.getByText('Alleen inhoud')).toBeInTheDocument();
  });

  it('sluit met de sluitknop', async () => {
    const gebruiker = userEvent.setup();
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    await gebruiker.click(screen.getByRole('button', { name: 'Sluiten' }));

    expect(sluiten).toHaveBeenCalledTimes(1);
  });

  it('sluit bij een tik naast het paneel', async () => {
    const gebruiker = userEvent.setup();
    const sluiten = vi.fn();
    const { container } = render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    await gebruiker.click(container.querySelector('.bottom-sheet-backdrop') as HTMLElement);

    expect(sluiten).toHaveBeenCalledTimes(1);
  });

  it('sluit met Escape', async () => {
    const gebruiker = userEvent.setup();
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    await gebruiker.keyboard('{Escape}');

    expect(sluiten).toHaveBeenCalledTimes(1);
  });

  it('sluit niet bij een tik op de inhoud zelf', async () => {
    const gebruiker = userEvent.setup();
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    await gebruiker.click(screen.getByText('Inhoud'));

    expect(sluiten).not.toHaveBeenCalled();
  });
});

describe('onderpaneel - de pagina eronder', () => {
  it('zet de pagina eronder op slot en geeft hem bij het sluiten weer vrij', () => {
    const { rerender } = render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('geeft de pagina ook vrij als het paneel ineens weg is', () => {
    const { unmount } = render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    unmount();

    expect(document.body.style.overflow).toBe('');
  });
});

describe('onderpaneel - toetsenbord', () => {
  it('zet de aandacht op de sluitknop zodra het paneel opengaat', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <button>Eerste keuze</button>
      </BottomSheet>,
    );

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sluiten' }));
  });

  it('geeft de aandacht terug aan de knop die het paneel opende', async () => {
    const gebruiker = userEvent.setup();

    function Pagina() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Toon keuzes</button>
          <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Kies een stuk">
            <p>Inhoud</p>
          </BottomSheet>
        </>
      );
    }

    render(<Pagina />);
    const opener = screen.getByRole('button', { name: 'Toon keuzes' });
    await gebruiker.click(opener);
    expect(document.activeElement).not.toBe(opener);

    await gebruiker.click(screen.getByRole('button', { name: 'Sluiten' }));

    expect(document.activeElement).toBe(opener);
  });

  it('houdt de aandacht binnen het paneel met Tab', async () => {
    const gebruiker = userEvent.setup();
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <button>Eerste keuze</button>
        <button>Laatste keuze</button>
      </BottomSheet>,
    );

    const sluitknop = screen.getByRole('button', { name: 'Sluiten' });
    const laatste = screen.getByRole('button', { name: 'Laatste keuze' });

    // Vanaf het laatste element springt Tab terug naar het eerste.
    laatste.focus();
    await gebruiker.tab();
    expect(document.activeElement).toBe(sluitknop);

    // En andersom met Shift+Tab vanaf het eerste.
    await gebruiker.tab({ shift: true });
    expect(document.activeElement).toBe(laatste);
  });

  it('struikelt niet over een paneel zonder enig bedienbaar element', async () => {
    const gebruiker = userEvent.setup();
    render(
      <BottomSheet isOpen onClose={vi.fn()} showHandle={false}>
        <p>Alleen tekst</p>
      </BottomSheet>,
    );

    await gebruiker.tab();

    expect(screen.getByText('Alleen tekst')).toBeInTheDocument();
  });

  /**
   * BEWIJS - de aandacht springt weg tijdens het typen.
   *
   * Het effect dat de aandacht regelt hing aan `[isOpen, onClose]`. Vrijwel
   * elke aanroeper geeft `onClose={() => setOpen(false)}` mee, en dat is bij
   * elke tekening van het bovenliggende scherm een nieuwe functie. Het effect
   * werd dus opnieuw uitgevoerd bij elke tekening: de opruiming gaf de
   * aandacht terug aan het element van vóór het paneel, en het effect zette
   * hem daarna op de sluitknop.
   *
   * Wie in een zoekveld in het paneel typte, raakte na de eerste letter de
   * aandacht kwijt aan de sluitknop - elke volgende letter kwam nergens
   * terecht. Precies het geval waar een onderpaneel voor bedoeld is: kiezen
   * uit een lange lijst, met een zoekveld erboven.
   *
   * De reparatie: `onClose` in een ref, zodat het effect alleen nog op
   * `isOpen` reageert.
   *
   * Op de oude code is deze test rood: het veld bevat dan alleen 'M' en de
   * aandacht staat op de sluitknop. Nagekeken door BottomSheet.tsx op HEAD
   * terug te zetten en deze test te draaien.
   */
  it('laat de aandacht staan terwijl de gebruiker in het paneel typt', async () => {
    const gebruiker = userEvent.setup();

    function Zoekpaneel() {
      const [zoekterm, setZoekterm] = useState('');
      const [open, setOpen] = useState(true);
      return (
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Kies een stuk">
          <input aria-label="Zoek" value={zoekterm} onChange={(e) => setZoekterm(e.target.value)} />
        </BottomSheet>
      );
    }

    render(<Zoekpaneel />);
    const veld = screen.getByRole('textbox', { name: 'Zoek' });

    await gebruiker.click(veld);
    await gebruiker.keyboard('Mozart');

    expect(veld).toHaveValue('Mozart');
    expect(document.activeElement).toBe(veld);
  });
});

describe('onderpaneel - vegen', () => {
  it('sluit bij een veeg naar beneden', () => {
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    act(() => veeg(paneel(), 100, 260));

    expect(sluiten).toHaveBeenCalled();
  });

  it('volgt de vinger tijdens het vegen en veert terug bij een te korte veeg', () => {
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );
    const venster = paneel();

    fireEvent.touchStart(venster, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(venster, { touches: [{ clientX: 100, clientY: 130 }] });

    // Het paneel schuift met de vinger mee.
    expect(venster.style.transform).toBe('translateY(30px)');

    fireEvent.touchEnd(venster, { changedTouches: [{ clientX: 100, clientY: 130 }] });

    // Dertig pixels is te weinig om los te laten: het paneel veert terug.
    expect(venster.style.transform).toBe('translateY(0)');
    expect(sluiten).not.toHaveBeenCalled();
  });

  it('schuift niet mee bij een veeg omhoog', () => {
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );
    const venster = paneel();

    fireEvent.touchStart(venster, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchMove(venster, { touches: [{ clientX: 100, clientY: 170 }] });

    expect(venster.style.transform).toBe('');
    expect(sluiten).not.toHaveBeenCalled();
  });

  it('blijft staan bij een veeg naar beneden als vegen uitgezet is', () => {
    const sluiten = vi.fn();
    render(
      <BottomSheet isOpen onClose={sluiten} title="Kies een stuk" swipeToDismiss={false}>
        <p>Inhoud</p>
      </BottomSheet>,
    );

    act(() => veeg(paneel(), 100, 260));

    expect(sluiten).not.toHaveBeenCalled();
  });
});

describe('onderpaneel - vormgeving die de gebruiker merkt', () => {
  it('toont het sleepgreepje standaard en laat het op verzoek weg', () => {
    const { container, rerender } = render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    // Het greepje is het enige element met de sleepcursor.
    const metGreep = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      (d) => d.style.cursor === 'grab',
    );
    expect(metGreep).toHaveLength(1);

    rerender(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" showHandle={false}>
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(Array.from(container.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.cursor === 'grab')).toEqual(
      [],
    );
  });

  it('toont geen sleepcursor als er toch niet weggeveegd kan worden', () => {
    const { container } = render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" swipeToDismiss={false}>
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(Array.from(container.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.cursor === 'grab')).toEqual(
      [],
    );
  });

  it('vult bij een volledige hoogte het scherm en laat de ronde hoeken los', () => {
    const { rerender } = render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" height="full">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(paneel().style.height).toBe('100vh');
    expect(paneel().style.borderTopLeftRadius).toBe('0px');

    rerender(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" height="half">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(paneel().style.height).toBe('50vh');
    expect(paneel().style.borderTopLeftRadius).toBe('16px');
  });

  it('groeit standaard mee met de inhoud tot negentig procent van het scherm', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(paneel().style.maxHeight).toBe('90vh');
    expect(paneel().style.height).toBe('');
  });

  it('neemt een eigen klassenaam over, zodat een scherm het paneel kan bijkleuren', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Kies een stuk" className="stukkenkiezer">
        <p>Inhoud</p>
      </BottomSheet>,
    );

    expect(paneel()).toHaveClass('bottom-sheet', 'stukkenkiezer');
  });
});
