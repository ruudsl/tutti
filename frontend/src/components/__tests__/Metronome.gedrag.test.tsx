/**
 * De metronoom, zonder Web Audio.
 *
 * jsdom kent geen `AudioContext`, dus die wordt hieronder nagebouwd: een
 * context met een klok die de test zelf vooruitzet, en oscillatoren die
 * onthouden op welke frequentie en op welk tijdstip ze gestart zijn. Wat
 * overblijft is de laag waar het om gaat: welke tik hoort bij welke tel, wat
 * doet een tempowijziging met de tussentijd, en houdt stoppen ook echt op.
 *
 * De klok van de audiocontext staat stil tenzij een test hem verzet. Dat is
 * met opzet: de planner in Metronome.tsx kijkt honderd milliseconden vooruit
 * (`scheduleAheadTime`), dus met een stilstaande klok plant hij precies de
 * tikken die binnen dat venster vallen en geen enkele meer. Zo is het aantal
 * gemaakte oscillatoren te tellen in plaats van te moeten benaderen.
 *
 * Op 120 BPM duurt een tel een halve seconde, op 60 BPM een hele. De eerste
 * tel van een maat klinkt op 1000 Hz, de overige op 800 Hz; dat is het
 * accent dat de maatsoort hoorbaar maakt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Metronome } from '../Metronome';

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, opties?: Record<string, unknown> | string) => {
        const tekst = zoek(sleutel) ?? (typeof opties === 'string' ? opties : sleutel);
        if (opties && typeof opties === 'object') {
          return Object.entries(opties).reduce(
            (uit, [naam, waarde]) => uit.replace(`{{${naam}}}`, String(waarde)),
            tekst,
          );
        }
        return tekst;
      },
    }),
  };
});

/** Eén gestarte tik: de frequentie en het tijdstip waarop hij klinkt. */
interface Tik {
  frequentie: number;
  tijd: number;
}

const tikken: Tik[] = [];
let gemaakteContexten: NepAudioContext[] = [];

class NepOscillator {
  frequency = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
  stop = vi.fn();
  start(tijd: number) {
    tikken.push({ frequentie: this.frequency.value, tijd });
  }
}

class NepGain {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class NepAudioContext {
  /** De klok van de audiocontext; alleen een test zet hem vooruit. */
  currentTime = 0;
  state: 'suspended' | 'running' = 'suspended';
  destination = {};
  resume = vi.fn(() => {
    this.state = 'running';
  });
  close = vi.fn();
  createOscillator = () => new NepOscillator();
  createGain = () => new NepGain();

  constructor() {
    gemaakteContexten.push(this);
  }
}

/**
 * De schuifregelaar verzetten. `userEvent` kan niet met een `input[type=range]`
 * overweg - een sleepbeweging heeft opmaak nodig die jsdom niet berekent - dus
 * gaat de nieuwe waarde er hier rechtstreeks in, net zoals de browser dat na
 * het slepen doet.
 */
function fireWijziging(veld: HTMLElement, waarde: string) {
  fireEvent.change(veld, { target: { value: waarde } });
}

/** Zet de audioklok vooruit en laat de planner zijn ronde doen. */
async function verstrijk(seconden: number) {
  const context = gemaakteContexten[0];
  await act(async () => {
    context.currentTime += seconden;
    vi.advanceTimersByTime(25);
  });
}

beforeEach(() => {
  tikken.length = 0;
  gemaakteContexten = [];
  vi.stubGlobal('AudioContext', NepAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Metronome: starten en stoppen', () => {
  it('start op de eerste tel met een accent en toont daarna de stopknop', async () => {
    const gebruiker = userEvent.setup();
    render(<Metronome />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));

    // Meteen bij het starten valt de eerste tel: die is geaccentueerd.
    expect(tikken).toEqual([{ frequentie: 1000, tijd: 0 }]);
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^▶ Start$/ })).not.toBeInTheDocument();
  });

  it('hervat een opgeschorte audiocontext, anders blijft de metronoom stil', async () => {
    const gebruiker = userEvent.setup();
    render(<Metronome />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));

    expect(gemaakteContexten[0].resume).toHaveBeenCalled();
  });

  it('stopt met tikken zodra de gebruiker op stop drukt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(1);
    const naEenSeconde = tikken.length;
    expect(naEenSeconde).toBeGreaterThan(1);

    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));
    await verstrijk(2);

    expect(tikken).toHaveLength(naEenSeconde);
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument();
  });

  it('sluit de audiocontext als het onderdeel van het scherm verdwijnt', async () => {
    const gebruiker = userEvent.setup();
    const { unmount } = render(<Metronome />);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    unmount();

    expect(gemaakteContexten[0].close).toHaveBeenCalled();
  });
});

describe('Metronome: tempo', () => {
  it('toont het gekozen tempo en gebruikt het meteen voor de tussentijd', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    const schuif = screen.getByLabelText('Tempo: 120 BPM');
    fireWijziging(schuif, '60');

    expect(screen.getByLabelText('Tempo: 60 BPM')).toBe(schuif);

    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    // Op 60 BPM duurt een tel een seconde: na één seconde is er één tik bij.
    await verstrijk(1);

    expect(tikken.map((tik) => tik.tijd)).toEqual([0, 1]);
  });

  it('laat een tempowijziging tijdens het spelen meelopen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    fireWijziging(screen.getByLabelText('Tempo: 120 BPM'), '60');
    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(1);
    expect(tikken).toHaveLength(2);

    // Tempo verdubbelen. De eerstvolgende tel stond al gepland op seconde 2 en
    // blijft daar; pas de tel daarna valt een halve seconde later.
    fireWijziging(screen.getByLabelText('Tempo: 60 BPM'), '120');
    await verstrijk(1);
    expect(tikken.map((tik) => tik.tijd)).toEqual([0, 1, 2]);

    await verstrijk(0.5);
    expect(tikken.map((tik) => tik.tijd)).toEqual([0, 1, 2, 2.5]);
  });

  it('leidt het tempo af uit twee tikken op de tapknop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T12:00:00Z'));
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    const tap = screen.getByRole('button', { name: 'Tap' });
    await gebruiker.click(tap);
    // Een halve seconde tussen twee tikken is 120 BPM.
    vi.setSystemTime(new Date('2026-08-23T12:00:00.500Z'));
    await gebruiker.click(tap);

    expect(screen.getByLabelText('Tempo: 120 BPM')).toBeInTheDocument();

    // Nog een tik, nu een hele seconde later: het gemiddelde zakt naar 80 BPM.
    vi.setSystemTime(new Date('2026-08-23T12:00:01.500Z'));
    await gebruiker.click(tap);

    expect(screen.getByLabelText('Tempo: 80 BPM')).toBeInTheDocument();
  });

  it('negeert een taptempo buiten het bereik van 30 tot 300 BPM', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-23T12:00:00Z'));
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    const tap = screen.getByRole('button', { name: 'Tap' });
    await gebruiker.click(tap);
    // 100 ms tussen twee tikken zou 600 BPM zijn: te snel om te bedoelen.
    vi.setSystemTime(new Date('2026-08-23T12:00:00.100Z'));
    await gebruiker.click(tap);

    expect(screen.getByLabelText('Tempo: 120 BPM')).toBeInTheDocument();
  });
});

describe('Metronome: maatsoort', () => {
  it('toont evenveel telbolletjes als de gekozen maatsoort telt', async () => {
    const gebruiker = userEvent.setup();
    const { container } = render(<Metronome />);

    expect(container.querySelectorAll('.beat-indicators > div')).toHaveLength(4);

    await gebruiker.click(screen.getByRole('button', { name: '3/4' }));

    expect(container.querySelectorAll('.beat-indicators > div')).toHaveLength(3);
  });

  it('accentueert alleen de eerste tel van de maat', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Metronome />);

    await gebruiker.click(screen.getByRole('button', { name: '3/4' }));
    fireWijziging(screen.getByLabelText('Tempo: 120 BPM'), '60');
    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));
    await verstrijk(3);

    // Vier tellen in een driekwartsmaat: alleen de eerste en de vierde
    // klinken geaccentueerd.
    expect(tikken.map((tik) => tik.frequentie)).toEqual([1000, 800, 800, 1000]);
  });

  it('licht de lopende tel op zolang de metronoom speelt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<Metronome />);

    const bolletjes = () => Array.from(container.querySelectorAll<HTMLElement>('.beat-indicators > div'));
    expect(bolletjes().map((bol) => bol.style.backgroundColor)).toEqual(Array(4).fill('var(--border)'));

    fireWijziging(screen.getByLabelText('Tempo: 120 BPM'), '60');
    await gebruiker.click(screen.getByRole('button', { name: /Start/ }));

    expect(bolletjes()[0].style.backgroundColor).toBe('var(--danger)');

    await verstrijk(1);
    expect(bolletjes()[1].style.backgroundColor).toBe('var(--primary)');

    await gebruiker.click(screen.getByRole('button', { name: /Stop/ }));
    expect(bolletjes().map((bol) => bol.style.backgroundColor)).toEqual(Array(4).fill('var(--border)'));
  });
});

describe('Metronome: compacte weergave', () => {
  it('houdt het ingetikte tempo binnen 30 en 300 BPM', () => {
    render(<Metronome compact />);

    const veld = screen.getByRole('spinbutton');

    fireWijziging(veld, '500');
    expect(veld).toHaveValue(300);

    fireWijziging(veld, '5');
    expect(veld).toHaveValue(30);

    // Een leeg veld valt terug op het standaardtempo in plaats van op NaN.
    fireWijziging(veld, '');
    expect(veld).toHaveValue(120);
  });

  it('start en stopt met dezelfde knop', async () => {
    const gebruiker = userEvent.setup();
    render(<Metronome compact />);

    await gebruiker.click(screen.getByTitle('Start metronoom'));
    expect(tikken).toHaveLength(1);

    await gebruiker.click(screen.getByTitle('Stop metronoom'));
    expect(screen.getByTitle('Start metronoom')).toBeInTheDocument();
  });
});
