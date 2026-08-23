/**
 * Het stemapparaat, zonder microfoon en zonder Web Audio.
 *
 * jsdom heeft geen `AudioContext` en geen microfoon, dus die worden hieronder
 * nagebouwd: een analyser die een zelfgekozen golf in de buffer schrijft, een
 * audiocontext met een vaste bemonsteringsfrequentie, en een `getUserMedia`
 * die toestemming geeft of weigert. Wat overblijft is de laag waar het om
 * gaat: van een gehoorde golf naar "A4, +17 cent" op het scherm, en van een
 * geweigerde microfoon naar een uitleg in plaats van een leeg scherm.
 *
 * De golf is steeds een cosinus met een geheel aantal samples per periode. Dat
 * is geen willekeurige keuze: het autocorrelatie-algoritme in Tuner.tsx zoekt
 * de verschuiving waarbij het signaal het meest op zichzelf lijkt, en bij een
 * gehele periode valt die verschuiving precies op een sample. De uitkomst is
 * dan exact `sampleRate / periode`, zodat de verwachte noot en het aantal cent
 * uit te rekenen zijn in plaats van te moeten worden benaderd.
 *
 * Met 44000 Hz bemonstering:
 *   periode 100 -> 440,0 Hz -> A4,  0 cent (zuiver)
 *   periode  99 -> 444,4 Hz -> A4, +17 cent (te hoog)
 *   periode 101 -> 435,6 Hz -> A4, -17 cent (te laag)
 *   periode 168 -> 261,9 Hz -> C4, +2 cent
 *   periode  50 -> 880,0 Hz -> A5,  0 cent (een octaaf hoger)
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Tuner } from '../Tuner';

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

const BEMONSTERING = 44000;

/** Wat de microfoon op dit moment "hoort", als functie van het samplenummer. */
let golf: (i: number) => number = () => 0;

function cosinusMetPeriode(periodeInSamples: number) {
  return (i: number) => Math.cos((2 * Math.PI * i) / periodeInSamples);
}

const stilte = () => 0;

/** De volgende tekenopdracht van requestAnimationFrame, zodat de lus stilstaat. */
let volgendeFrame: FrameRequestCallback | null = null;

let microfoonSpoor: { stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
let audioContextGooit: Error | null = null;
let gemaakteContexten: NepAudioContext[] = [];

class NepAnalyser {
  fftSize = 0;
  connect = vi.fn();
  getFloatTimeDomainData(buffer: Float32Array) {
    for (let i = 0; i < buffer.length; i++) buffer[i] = golf(i);
  }
}

class NepAudioContext {
  sampleRate = BEMONSTERING;
  analyser = new NepAnalyser();
  close = vi.fn();
  createAnalyser = () => this.analyser;
  createMediaStreamSource = () => ({ connect: vi.fn() });

  constructor() {
    if (audioContextGooit) throw audioContextGooit;
    gemaakteContexten.push(this);
  }
}

beforeEach(() => {
  golf = stilte;
  volgendeFrame = null;
  audioContextGooit = null;
  gemaakteContexten = [];
  microfoonSpoor = { stop: vi.fn() };
  getUserMedia = vi.fn(async () => ({ getTracks: () => [microfoonSpoor] }));

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  vi.stubGlobal('AudioContext', NepAudioContext);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    volgendeFrame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    volgendeFrame = null;
  });

  // Het stemapparaat schrijft een geweigerde microfoon naar de console. Dat is
  // hier verwacht gedrag en geen testuitvoer.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Zet het stemapparaat aan en wacht tot de toestemmingsbelofte is afgehandeld. */
async function startLuisteren(naam: RegExp | string = 'Start') {
  await act(async () => {
    screen.getByRole('button', { name: naam }).click();
  });
}

/**
 * Alles wat er in het afleesvenster staat, als één tekst.
 *
 * De noot en het octaaf staan in aparte elementen ("A" met daarin een span met
 * "4"), en de standaardzoeker van testing-library kijkt alleen naar de losse
 * tekstknopen van één element. Zoeken op "A4" vindt dan niets, terwijl de
 * bezoeker het wel gewoon als "A4" leest. Vandaar deze omweg.
 */
function afleesvenster(): string {
  return document.querySelector('.tuner-display')?.textContent ?? '';
}

/** Het grote element met de noot erin, waarvan de kleur de stemming aangeeft. */
function noot(): HTMLElement {
  return document.querySelector('.tuner-display')!.firstElementChild as HTMLElement;
}

/** Doe alsof de browser een volgend beeld tekent, met de golf van dat moment. */
async function volgendBeeld() {
  const frame = volgendeFrame;
  expect(frame).not.toBeNull();
  await act(async () => {
    frame!(0);
  });
}

describe('stemapparaat: voordat er geluisterd wordt', () => {
  it('legt uit hoe je begint', () => {
    render(<Tuner />);

    expect(screen.getByText('Klik Start om te stemmen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('vraagt de microfoon pas als de bezoeker daarom vraagt', () => {
    render(<Tuner />);

    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('vraagt de ruwe microfoon, zonder ruisonderdrukking die de toonhoogte vervormt', async () => {
    render(<Tuner />);

    await startLuisteren();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  });
});

describe('stemapparaat: van gehoorde golf naar noot', () => {
  it.each([
    [100, 'A', '4', '440 Hz', '0 cent'],
    [50, 'A', '5', '880 Hz', '0 cent'],
    [168, 'C', '4', '261.9 Hz', '+2 cent'],
  ])('herkent een periode van %i samples als %s%s', async (periode, noteNaam, octaaf, hertz, cent) => {
    golf = cosinusMetPeriode(periode);
    render(<Tuner />);

    await startLuisteren();

    expect(afleesvenster()).toContain(noteNaam + octaaf);
    expect(afleesvenster()).toContain(hertz);
    expect(afleesvenster()).toContain(cent);
  });

  it('meldt hoeveel de toon te hoog staat', async () => {
    golf = cosinusMetPeriode(99);
    render(<Tuner />);

    await startLuisteren();

    expect(afleesvenster()).toContain('A4');
    expect(afleesvenster()).toContain('+17 cent');
  });

  it('meldt hoeveel de toon te laag staat', async () => {
    golf = cosinusMetPeriode(101);
    render(<Tuner />);

    await startLuisteren();

    expect(afleesvenster()).toContain('A4');
    expect(afleesvenster()).toContain('-17 cent');
  });

  it('kleurt een zuivere toon anders dan een valse', async () => {
    golf = cosinusMetPeriode(100);
    render(<Tuner />);
    await startLuisteren();
    const zuiver = noot().getAttribute('style');

    golf = cosinusMetPeriode(99);
    await volgendBeeld();
    const vals = noot().getAttribute('style');

    expect(zuiver).toContain('var(--success)');
    expect(vals).toContain('var(--danger)');
  });

  it('wacht af zolang er niets te horen valt', async () => {
    golf = stilte;
    render(<Tuner />);

    await startLuisteren();

    expect(screen.getByText('Luisteren...')).toBeInTheDocument();
    expect(screen.queryByText(/cent$/)).not.toBeInTheDocument();
  });

  it('pikt de toon op zodra er wel gespeeld wordt', async () => {
    golf = stilte;
    render(<Tuner />);
    await startLuisteren();
    expect(screen.getByText('Luisteren...')).toBeInTheDocument();

    golf = cosinusMetPeriode(100);
    await volgendBeeld();

    expect(afleesvenster()).toContain('A4');
    expect(screen.queryByText('Luisteren...')).not.toBeInTheDocument();
  });

  it('laat de noot weer los als het stil wordt', async () => {
    golf = cosinusMetPeriode(100);
    render(<Tuner />);
    await startLuisteren();

    golf = stilte;
    await volgendBeeld();

    expect(afleesvenster()).not.toContain('A4');
    expect(screen.getByText('Luisteren...')).toBeInTheDocument();
  });

  it('geeft tijdens het luisteren uitleg bij de kleuren', async () => {
    golf = cosinusMetPeriode(100);
    render(<Tuner />);

    await startLuisteren();

    expect(screen.getByText('Groen = goed gestemd | Geel = bijna | Rood = te hoog/laag')).toBeInTheDocument();
  });
});

describe('stemapparaat: een geweigerde microfoon', () => {
  const weigering = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

  it('legt uit wat er mis is in plaats van een leeg scherm te tonen', async () => {
    getUserMedia.mockRejectedValue(weigering);
    render(<Tuner />);

    await startLuisteren();

    expect(
      screen.getByText('Kon geen toegang krijgen tot de microfoon. Controleer je browser instellingen.'),
    ).toBeInTheDocument();
    // En het scherm blijft bruikbaar: de uitleg en de startknop staan er nog.
    expect(screen.getByText('Klik Start om te stemmen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('doet niet alsof het luistert', async () => {
    getUserMedia.mockRejectedValue(weigering);
    render(<Tuner />);

    await startLuisteren();

    expect(screen.queryByText('Luisteren...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('legt het ook uit in de kleine variant, waar geen plek is voor een melding', async () => {
    getUserMedia.mockRejectedValue(weigering);
    render(<Tuner compact />);

    await startLuisteren('Start stemapparaat');

    expect(
      screen.getByText('Kon geen toegang krijgen tot de microfoon. Controleer je browser instellingen.'),
    ).toBeInTheDocument();
  });

  it('haalt de melding weg zodra een tweede poging wel lukt', async () => {
    getUserMedia.mockRejectedValueOnce(weigering);
    golf = cosinusMetPeriode(100);
    render(<Tuner />);

    await startLuisteren();
    expect(screen.getByText(/Kon geen toegang krijgen/)).toBeInTheDocument();

    await startLuisteren();

    expect(screen.queryByText(/Kon geen toegang krijgen/)).not.toBeInTheDocument();
    expect(afleesvenster()).toContain('A4');
  });
});

describe('stemapparaat: de microfoon gaat weer uit', () => {
  it('zet spoor en audiocontext uit bij Stop', async () => {
    golf = cosinusMetPeriode(100);
    render(<Tuner />);
    await startLuisteren();

    await act(async () => {
      screen.getByRole('button', { name: 'Stop' }).click();
    });

    expect(microfoonSpoor.stop).toHaveBeenCalledTimes(1);
    expect(gemaakteContexten[0].close).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Klik Start om te stemmen')).toBeInTheDocument();
  });

  it('zet de microfoon uit als het stemapparaat van het scherm verdwijnt', async () => {
    golf = cosinusMetPeriode(100);
    const { unmount } = render(<Tuner />);
    await startLuisteren();

    unmount();

    expect(microfoonSpoor.stop).toHaveBeenCalledTimes(1);
  });

  /**
   * BEWIJS. Ging er iets mis ná het verkrijgen van de microfoon - de
   * `AudioContext` die niet gemaakt kan worden is het gewone geval, bij een
   * browser die hem niet levert of hem blokkeert - dan bleef de opname staan.
   * De `catch` toonde alleen een melding; niemand zette het spoor uit. De
   * bezoeker zag "Kon geen toegang krijgen tot de microfoon" op zijn scherm
   * terwijl het opnamelampje van zijn browser bleef branden, tot hij het
   * tabblad sloot.
   *
   * Rood op de oude code: daar is `microfoonSpoor.stop` nul keer aangeroepen.
   */
  it('zet de microfoon uit als het misgaat nadat de toestemming al gegeven is', async () => {
    audioContextGooit = new Error('AudioContext niet beschikbaar');
    render(<Tuner />);

    await startLuisteren();

    expect(screen.getByText(/Kon geen toegang krijgen/)).toBeInTheDocument();
    expect(microfoonSpoor.stop).toHaveBeenCalledTimes(1);
  });

  /**
   * BEWIJS. Wie op Start klikt en wegnavigeert terwijl de browser nog om
   * toestemming vraagt, liet een microfoon achter: de belofte van
   * `getUserMedia` kwam pas terug nadat de component al weg was, en zette het
   * spoor toen in een ref die niemand meer opruimt. De opruimfunctie bij het
   * verdwijnen had het spoor toen nog niet gezien.
   *
   * Rood op de oude code: daar is `microfoonSpoor.stop` nul keer aangeroepen.
   */
  it('zet de microfoon uit als de bezoeker wegklikt terwijl hij nog toestemming geeft', async () => {
    let geefToestemming: (stream: unknown) => void = () => {};
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        geefToestemming = resolve;
      }),
    );
    const { unmount } = render(<Tuner />);

    act(() => {
      screen.getByRole('button', { name: 'Start' }).click();
    });
    unmount();

    await act(async () => {
      geefToestemming({ getTracks: () => [microfoonSpoor] });
    });

    expect(microfoonSpoor.stop).toHaveBeenCalledTimes(1);
  });
});

describe('stemapparaat: de kleine variant', () => {
  it('toont de noot naast de knop zodra er geluisterd wordt', async () => {
    golf = cosinusMetPeriode(100);
    render(<Tuner compact />);

    await startLuisteren('Start stemapparaat');

    expect(screen.getByText('A4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop stemapparaat' })).toBeInTheDocument();
  });

  it('meldt dat er geluisterd wordt zolang er geen toon is', async () => {
    golf = stilte;
    render(<Tuner compact />);

    await startLuisteren('Start stemapparaat');

    expect(screen.getByText('Luisteren...')).toBeInTheDocument();
  });

  it('houdt zich stil zolang het stemapparaat uit staat', () => {
    render(<Tuner compact />);

    expect(screen.queryByText('Luisteren...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start stemapparaat' })).toBeInTheDocument();
  });
});
