/**
 * De uitvoeringsstand: het volledige scherm dat op de lessenaar staat tijdens
 * een concert.
 *
 * Wat hier telt is navigeren zonder te kijken. De dirigent of de speler bedient
 * dit met een pedaal of een afstandsbediening, en die sturen toetsaanslagen:
 * pijltjes, spatie, PageUp en PageDown. Die toetsen krijgen hier evenveel
 * aandacht als de knoppen op het scherm.
 *
 * `requestFullscreen` bestaat niet in jsdom en wordt hieronder nagebouwd, net
 * als `document.fullscreenElement`.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetlistMode } from '../SetlistMode';

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
    }),
  };
});

// De klok haalt de landinstelling via utils/locale uit i18n; die hele opzet
// hoort niet bij dit onderdeel en zou alleen maar meegeladen worden.
vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const STUKKEN = [
  { id: 's1', title: 'Ouverture 1812', composer: 'Tsjaikovski', duration: 900 },
  { id: 's2', title: 'Bolero', composer: 'Ravel', duration: 945, notes: 'Tempo strak houden' },
  { id: 's3', title: 'Finlandia', composer: 'Sibelius' },
];

/** De tekst van het stuk dat nu groot in beeld staat. */
function huidigStuk() {
  return screen.getByText(/\d+ \/ \d+/).textContent;
}

function toets(key: string) {
  fireEvent.keyDown(window, { key });
}

beforeEach(() => {
  Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true });
  document.documentElement.requestFullscreen = vi.fn(() => {
    (document as any).fullscreenElement = document.documentElement;
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn(() => {
    (document as any).fullscreenElement = null;
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SetlistMode: wat er op de lessenaar staat', () => {
  it('toont het eerste stuk met componist, duur en de plaats in het programma', () => {
    render(<SetlistMode pieces={STUKKEN} title="Nieuwjaarsconcert" />);

    expect(screen.getByText('Nieuwjaarsconcert')).toBeInTheDocument();
    expect(screen.getByText('Ouverture 1812')).toBeInTheDocument();
    expect(screen.getByText('Tsjaikovski')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(huidigStuk()).toBe('1 / 3');

    // Het volgende stuk staat vervaagd klaar, het vorige bestaat nog niet.
    expect(screen.getByText('Bolero')).toBeInTheDocument();
  });

  it('begint bij het meegegeven stuk in plaats van bij het eerste', () => {
    render(<SetlistMode pieces={STUKKEN} initialIndex={2} />);

    expect(huidigStuk()).toBe('3 / 3');
    expect(screen.getByRole('button', { name: /Volgende/ })).toBeDisabled();
  });

  it('laat de klok weg als daarom gevraagd wordt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 20, 15));

    const { rerender } = render(<SetlistMode pieces={STUKKEN} />);
    expect(screen.getByText('20:15')).toBeInTheDocument();

    rerender(<SetlistMode pieces={STUKKEN} showClock={false} />);
    expect(screen.queryByText('20:15')).not.toBeInTheDocument();
  });

  it('laat de klok elke minuut meelopen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 20, 15, 30));
    render(<SetlistMode pieces={STUKKEN} />);

    expect(screen.getByText('20:15')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.getByText('20:16')).toBeInTheDocument();
  });
});

describe('SetlistMode: navigeren', () => {
  it('gaat met de knoppen vooruit en achteruit door het programma', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    render(<SetlistMode pieces={STUKKEN} onPieceSelect={gekozen} />);

    expect(screen.getByRole('button', { name: /Vorige/ })).toBeDisabled();

    await gebruiker.click(screen.getByRole('button', { name: /Volgende/ }));
    expect(huidigStuk()).toBe('2 / 3');
    expect(gekozen).toHaveBeenCalledWith(STUKKEN[1], 1);

    await gebruiker.click(screen.getByRole('button', { name: /Vorige/ }));
    expect(huidigStuk()).toBe('1 / 3');
    expect(gekozen).toHaveBeenLastCalledWith(STUKKEN[0], 0);
  });

  it('springt naar een stuk via de stipjes naast het scherm', async () => {
    const gebruiker = userEvent.setup();
    const gekozen = vi.fn();
    render(<SetlistMode pieces={STUKKEN} onPieceSelect={gekozen} />);

    await gebruiker.click(screen.getByTitle('Finlandia'));

    expect(huidigStuk()).toBe('3 / 3');
    expect(gekozen).toHaveBeenCalledWith(STUKKEN[2], 2);
  });

  it('springt naar het volgende stuk door op de vervaagde titel te klikken', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistMode pieces={STUKKEN} />);

    await gebruiker.click(screen.getByText('Bolero'));

    expect(huidigStuk()).toBe('2 / 3');
    // Terug naar boven: het vorige stuk staat nu vervaagd bovenaan.
    await gebruiker.click(screen.getByText('Ouverture 1812'));
    expect(huidigStuk()).toBe('1 / 3');
  });

  it('luistert naar de toetsen van een bladwender', () => {
    render(<SetlistMode pieces={STUKKEN} />);

    toets('ArrowRight');
    expect(huidigStuk()).toBe('2 / 3');

    toets(' ');
    expect(huidigStuk()).toBe('3 / 3');

    // Voorbij het einde gebeurt er niets.
    toets('PageDown');
    expect(huidigStuk()).toBe('3 / 3');

    toets('ArrowUp');
    expect(huidigStuk()).toBe('2 / 3');

    toets('Home');
    expect(huidigStuk()).toBe('1 / 3');

    toets('End');
    expect(huidigStuk()).toBe('3 / 3');
  });
});

describe('SetlistMode: notities', () => {
  it('toont de notitie bij het stuk pas als erom gevraagd wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistMode pieces={STUKKEN} initialIndex={1} />);

    expect(screen.queryByText('Tempo strak houden')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByTestId('icon-fileText').closest('button')!);
    expect(screen.getByText('Tempo strak houden')).toBeInTheDocument();

    toets('n');
    expect(screen.queryByText('Tempo strak houden')).not.toBeInTheDocument();
  });

  it('toont niets bij een stuk zonder notitie', () => {
    render(<SetlistMode pieces={STUKKEN} initialIndex={2} />);

    toets('N');

    expect(screen.getByText('Finlandia')).toBeInTheDocument();
    expect(screen.queryByText('Tempo strak houden')).not.toBeInTheDocument();
  });
});

describe('SetlistMode: verlaten en volledig scherm', () => {
  it('verlaat de uitvoeringsstand met de terugknop en met Escape', async () => {
    const gebruiker = userEvent.setup();
    const verlaten = vi.fn();
    render(<SetlistMode pieces={STUKKEN} onExit={verlaten} />);

    await gebruiker.click(screen.getByRole('button', { name: /Terug/ }));
    expect(verlaten).toHaveBeenCalledTimes(1);

    toets('Escape');
    expect(verlaten).toHaveBeenCalledTimes(2);
  });

  it('schakelt met F het volledige scherm aan en uit', () => {
    render(<SetlistMode pieces={STUKKEN} />);

    expect(screen.getByTestId('icon-maximize')).toBeInTheDocument();

    toets('f');
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(screen.getByTestId('icon-minimize')).toBeInTheDocument();

    toets('F');
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(screen.getByTestId('icon-maximize')).toBeInTheDocument();
  });

  it('sluit met Escape eerst het volledige scherm en verlaat pas daarna', () => {
    const verlaten = vi.fn();
    render(<SetlistMode pieces={STUKKEN} onExit={verlaten} />);

    toets('f');
    toets('Escape');

    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(verlaten).not.toHaveBeenCalled();

    toets('Escape');
    expect(verlaten).toHaveBeenCalledTimes(1);
  });
});
