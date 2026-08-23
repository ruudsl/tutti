/**
 * De stemfluit, zonder Web Audio.
 *
 * jsdom kent geen `AudioContext`, dus die staat hieronder nagebouwd: een
 * context met een klok die stilstaat, en oscillatoren die onthouden op welke
 * frequentie ze gezet zijn en of ze gestopt zijn. Daarmee is te testen wat de
 * gebruiker van de stemfluit verwacht: dat de knop die hij indrukt de toon
 * geeft die erop staat, dat een tweede druk hem weer stil maakt, en dat een
 * andere referentietoon alles meeneemt.
 *
 * Dat laatste is de kern van dit onderdeel. Een orkest dat op 442 Hz stemt
 * wil ook een Bb horen die daarbij past: 466,16 x 442/440 = 468,28 Hz. De
 * knop hoort dat afgerond te tonen en die frequentie ook echt te laten
 * klinken.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PitchPipe } from '../PitchPipe';

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

class NepOscillator {
  type = '';
  frequency = {
    value: 0,
    setValueAtTime: vi.fn((waarde: number) => {
      this.frequency.value = waarde;
    }),
  };
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class NepGain {
  gain = {
    value: 0.3,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

let oscillatoren: NepOscillator[] = [];
let contexten: NepAudioContext[] = [];

class NepAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' = 'suspended';
  destination = {};
  resume = vi.fn(() => {
    this.state = 'running';
  });
  close = vi.fn();
  createOscillator = () => {
    const oscillator = new NepOscillator();
    oscillatoren.push(oscillator);
    return oscillator;
  };
  createGain = () => new NepGain();

  constructor() {
    contexten.push(this);
  }
}

/** De frequentie van de toon die op dit moment klinkt. */
const klinkendeFrequentie = () => oscillatoren[oscillatoren.length - 1]?.frequency.value;

beforeEach(() => {
  oscillatoren = [];
  contexten = [];
  vi.stubGlobal('AudioContext', NepAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const veelgebruikt = () => within(screen.getByRole('group', { name: 'Veelgebruikte tonen' }));
const referentie = () => within(screen.getByRole('group', { name: 'Referentietoon' }));

describe('PitchPipe: een toon geven', () => {
  it('speelt de toon die op de knop staat', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    await gebruiker.click(veelgebruikt().getByRole('button', { name: /^A 440Hz/ }));

    expect(klinkendeFrequentie()).toBe(440);
    expect(oscillatoren[0].type).toBe('sine');
    expect(oscillatoren[0].start).toHaveBeenCalled();
    expect(contexten[0].resume).toHaveBeenCalled();
  });

  it('toont een stopknop zolang er een toon klinkt', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    expect(screen.queryByRole('button', { name: 'Stoppen' })).not.toBeInTheDocument();

    await gebruiker.click(veelgebruikt().getByRole('button', { name: 'F349Hz' }));
    expect(screen.getByRole('button', { name: 'Stoppen' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Stoppen' }));
    expect(screen.queryByRole('button', { name: 'Stoppen' })).not.toBeInTheDocument();
  });

  it('maakt de toon stil bij een tweede druk op dezelfde knop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PitchPipe />);

    const knop = veelgebruikt().getByRole('button', { name: 'Eb311Hz' });
    await gebruiker.click(knop);
    await gebruiker.click(knop);

    // De toon zakt in honderd milliseconden weg voordat de oscillator stopt.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(oscillatoren[0].stop).toHaveBeenCalled();
    expect(oscillatoren).toHaveLength(1);
  });

  it('wisselt van toon zonder de vorige te laten doorklinken', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    await gebruiker.click(veelgebruikt().getByRole('button', { name: /^A 440Hz/ }));
    await gebruiker.click(veelgebruikt().getByRole('button', { name: 'Bb466Hz' }));

    expect(oscillatoren).toHaveLength(2);
    expect(oscillatoren[0].stop).toHaveBeenCalled();
    expect(oscillatoren[0].disconnect).toHaveBeenCalled();
    expect(klinkendeFrequentie()).toBeCloseTo(466.16, 2);
  });

  it('sluit de audiocontext als het onderdeel van het scherm verdwijnt', async () => {
    const gebruiker = userEvent.setup();
    const { unmount } = render(<PitchPipe />);

    await gebruiker.click(veelgebruikt().getByRole('button', { name: /^A 440Hz/ }));
    unmount();

    expect(contexten[0].close).toHaveBeenCalled();
  });
});

describe('PitchPipe: referentietoon', () => {
  it('rekent de veelgebruikte tonen om naar de gekozen referentie', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    expect(veelgebruikt().getByRole('button', { name: 'Bb466Hz' })).toBeInTheDocument();

    await gebruiker.click(referentie().getByRole('button', { name: 'A 442Hz' }));

    // 466,16 x 442/440 = 468,28 -> afgerond 468.
    expect(veelgebruikt().getByRole('button', { name: 'Bb468Hz' })).toBeInTheDocument();
    expect(veelgebruikt().queryByRole('button', { name: 'Bb466Hz' })).not.toBeInTheDocument();
  });

  it('laat de omgerekende toon ook echt klinken', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    await gebruiker.click(referentie().getByRole('button', { name: 'A 443Hz' }));
    // De knop heet nog steeds naar zijn stemtoon 'A 440Hz'; het getal erachter
    // is de omgerekende frequentie die hij nu geeft.
    await gebruiker.click(veelgebruikt().getByRole('button', { name: /^A 440Hz443Hz$/ }));

    expect(klinkendeFrequentie()).toBeCloseTo(443, 5);
  });
});

describe('PitchPipe: alle noten', () => {
  it('klapt de chromatische toonladder open en weer dicht', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    expect(screen.queryByRole('button', { name: 'C5' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Alle noten tonen' }));
    expect(screen.getByRole('button', { name: 'C5' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Alle noten verbergen' }));
    expect(screen.queryByRole('button', { name: 'C5' })).not.toBeInTheDocument();
  });

  it('speelt een gekozen noot uit de toonladder', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe />);

    await gebruiker.click(screen.getByRole('button', { name: 'Alle noten tonen' }));
    await gebruiker.click(screen.getByRole('button', { name: 'C5' }));

    expect(klinkendeFrequentie()).toBeCloseTo(523.25, 2);
  });
});

describe('PitchPipe: compacte weergave', () => {
  it('start en stopt de stemtoon met dezelfde knop', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe compact />);

    await gebruiker.click(screen.getByRole('button', { name: /A 440/ }));
    expect(klinkendeFrequentie()).toBe(440);

    await gebruiker.click(screen.getByTitle('Stoppen'));
    expect(screen.getByTitle('Afspelen')).toBeInTheDocument();
  });

  it('schakelt tijdens het klinken meteen over op de nieuwe referentietoon', async () => {
    const gebruiker = userEvent.setup();
    render(<PitchPipe compact />);

    await gebruiker.click(screen.getByRole('button', { name: /A 440/ }));
    await gebruiker.selectOptions(screen.getByRole('combobox'), '442');

    expect(klinkendeFrequentie()).toBe(442);
    expect(oscillatoren).toHaveLength(2);
  });
});
