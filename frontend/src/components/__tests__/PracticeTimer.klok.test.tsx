/**
 * De oefentimer: lopen, pauzeren, hervatten en afsluiten.
 *
 * De timer leest de wandklok (`Date.now`) en werkt zichzelf elke seconde bij.
 * Daarom staan de klokken hier stil tenzij een test ze vooruitzet: met
 * `vi.useFakeTimers` lopen `setInterval` en `Date.now` samen op, zodat een
 * verstreken minuut hier precies een minuut is en niet "ongeveer".
 *
 * Onderaan staat een regressietest bij een echte fout in het pauzeren, met
 * het bewijs dat hij op de oude code rood was.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeTimer } from '../PracticeTimer';

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

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

/** Zet zowel de wandklok als de intervallen `seconden` vooruit. */
async function verstrijk(seconden: number) {
  await act(async () => {
    vi.advanceTimersByTime(seconden * 1000);
  });
}

function maakGebruiker() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-23T10:00:00Z'));
  localStorage.clear();
  // jsdom kan geen geluid afspelen; het belsignaal bij het bereiken van het
  // doel is bijzaak en wordt hier afgevangen.
  vi.stubGlobal(
    'Audio',
    class {
      volume = 1;
      play = vi.fn(() => Promise.resolve());
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PracticeTimer: tellen', () => {
  it('begint op nul en telt de verstreken tijd op', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    expect(screen.getByText('0:00')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(65);

    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('toont uren zodra de oefensessie er langer dan een duurt', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(3661);

    expect(screen.getByText('1:01:01')).toBeInTheDocument();
  });

  it('noemt het stuk waar aan geoefend wordt', () => {
    render(<PracticeTimer musicPieceName="Also sprach Zarathustra" />);

    expect(screen.getByText('Also sprach Zarathustra')).toBeInTheDocument();
  });
});

describe('PracticeTimer: pauzeren en afsluiten', () => {
  it('houdt de teller stil zolang er gepauzeerd is', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(10);
    await gebruiker.click(screen.getByRole('button', { name: /Pauze/ }));
    await verstrijk(30);

    expect(screen.getByText('0:10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Doorgaan/ })).toBeInTheDocument();
  });

  it('geeft de geoefende minuten door bij het stoppen en begint weer op nul', async () => {
    const gebruiker = maakGebruiker();
    const sessieAfgelopen = vi.fn();
    render(<PracticeTimer onSessionEnd={sessieAfgelopen} />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(90);
    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));

    // Anderhalve minuut wordt afgerond naar twee.
    expect(sessieAfgelopen).toHaveBeenCalledWith(2);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument();
  });

  it('meldt geen sessie die naar nul minuten afrondt', async () => {
    const gebruiker = maakGebruiker();
    const sessieAfgelopen = vi.fn();
    render(<PracticeTimer onSessionEnd={sessieAfgelopen} />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(20);
    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));

    expect(sessieAfgelopen).not.toHaveBeenCalled();
  });

  it('telt na het stoppen een nieuwe sessie weer vanaf nul', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(120);
    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(5);

    expect(screen.getByText('0:05')).toBeInTheDocument();
  });
});

describe('PracticeTimer: doel', () => {
  it('meldt het bereiken van het doel', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: 'Doel wijzigen' }));
    await gebruiker.click(screen.getByRole('button', { name: '15min' }));

    // De keuzelijst klapt dicht zodra er een doel gekozen is.
    expect(screen.queryByRole('button', { name: '15min' })).not.toBeInTheDocument();
    expect(screen.getByText(/Doel: 15 minuten/)).toBeInTheDocument();
    expect(screen.queryByText('Doel bereikt!')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(15 * 60);

    expect(screen.getByText('Doel bereikt!')).toBeInTheDocument();
  });

  it('neemt een zelf ingevuld doel over', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: 'Doel wijzigen' }));
    await gebruiker.type(screen.getByPlaceholderText('Aangepast doel'), '75');
    await gebruiker.click(screen.getByRole('button', { name: 'Toepassen' }));

    expect(screen.getByText(/Doel: 75 minuten/)).toBeInTheDocument();
  });

  it('weigert een doel van meer dan acht uur', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: 'Doel wijzigen' }));
    await gebruiker.type(screen.getByPlaceholderText('Aangepast doel'), '500');
    await gebruiker.click(screen.getByRole('button', { name: 'Toepassen' }));

    // Het doel blijft staan en de keuzelijst blijft open.
    expect(screen.getByText(/Doel: 30 minuten/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '15min' })).toBeInTheDocument();
  });

  it('houdt de toepasknop uit tot er iets ingevuld is', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: 'Doel wijzigen' }));

    expect(screen.getByRole('button', { name: 'Toepassen' })).toBeDisabled();
  });
});

describe('PracticeTimer: compacte weergave', () => {
  it('toont de tijd naast het doel en biedt pas een stopknop als er tijd staat', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer compact />);

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('/ 30min')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await gebruiker.click(screen.getByRole('button', { name: '▶' }));
    await verstrijk(45);

    expect(screen.getByText('0:45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⏹' })).toBeInTheDocument();
  });
});

describe('PracticeTimer: regressie na reparatie', () => {
  /**
   * Bewijs: op de oude code stond hier 0:40 in plaats van 0:15.
   *
   * `handlePause` liet `startTimeRef` staan, en het effect dat de teller
   * opstart raakt die alleen aan als hij leeg is. Bij het hervatten werd de
   * verstreken tijd dus opnieuw berekend als "nu min het oorspronkelijke
   * starttijdstip", waardoor de pauze meegeteld werd. Wie tussendoor een half
   * uur wegliep, kreeg dat half uur cadeau in zijn oefenlog.
   */
  it('telt de pauze niet mee na het hervatten', async () => {
    const gebruiker = maakGebruiker();
    render(<PracticeTimer />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(10);
    await gebruiker.click(screen.getByRole('button', { name: /Pauze/ }));
    await verstrijk(25);
    await gebruiker.click(screen.getByRole('button', { name: /Doorgaan/ }));
    await verstrijk(5);

    expect(screen.getByText('0:15')).toBeInTheDocument();
  });

  /**
   * Bewijs: op de oude code werd hier een oefensessie van 1 minuut gemeld,
   * terwijl er vijftien seconden geoefend was. De pauze belandde zo in het
   * oefenlog van de gebruiker.
   */
  it('geeft na een pauze alleen de echt geoefende minuten door', async () => {
    const gebruiker = maakGebruiker();
    const sessieAfgelopen = vi.fn();
    render(<PracticeTimer onSessionEnd={sessieAfgelopen} />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(10);
    await gebruiker.click(screen.getByRole('button', { name: /Pauze/ }));
    await verstrijk(60);
    await gebruiker.click(screen.getByRole('button', { name: /Doorgaan/ }));
    await verstrijk(5);
    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));

    expect(sessieAfgelopen).not.toHaveBeenCalled();
  });
});
