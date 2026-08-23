/**
 * Het bluetooth-pedaal: bladeren met je voet.
 *
 * Deze hook praat met de Web Bluetooth API. Die bestaat in jsdom niet, en in
 * de meeste browsers trouwens ook niet - Firefox en Safari kennen hem
 * helemaal niet, en zelfs waar hij bestaat opent hij een keuzevenster dat
 * alleen na een echte muisklik van de gebruiker verschijnt. Er valt dus niets
 * te "bijna echt" doen: `navigator.bluetooth` wordt hieronder van a tot z
 * nagebootst.
 *
 * WAT DE NAMAAK WEL EN NIET BEWIJST.
 *
 * Wat hij bewijst: welke vraag de hook aan de browser stelt, wat hij met het
 * antwoord doet, hoe hij een geweigerde koppeling opvangt, hoe hij de
 * batterijstand bijhoudt en welke voetknop op welke handeling uitkomt. Dat is
 * alles wat deze hook zelf is.
 *
 * Wat hij niet bewijst: dat een echte AirTurn of PageFlip dezelfde bytes
 * stuurt als de nepbytes hieronder. De vertaling van HID-rapport naar
 * paginawissel is een gok van de code (`0x01` is "volgende"), en een test kan
 * die gok niet nakijken - alleen vastleggen. Het staat er als
 * karakterisering, niet als bewijs dat het pedaal in de kerk werkt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBluetoothPedal } from '../useBluetoothPedal';

/* ------------------------------------------------------------------ */
/* De namaakbluetooth                                                  */
/* ------------------------------------------------------------------ */

type Luisteraar = (event: { target: unknown }) => void;

/** Een kenmerk (characteristic): batterijstand of HID-rapport. */
function maakKenmerk(beginwaarde?: number) {
  const luisteraars: Record<string, Luisteraar[]> = {};
  const kenmerk = {
    value: beginwaarde === undefined ? undefined : new DataView(new Uint8Array([beginwaarde]).buffer),
    readValue: vi.fn(async () => new DataView(new Uint8Array([beginwaarde ?? 0]).buffer)),
    startNotifications: vi.fn(async () => undefined),
    addEventListener: vi.fn((soort: string, fn: Luisteraar) => {
      (luisteraars[soort] ??= []).push(fn);
    }),
    /** Doe alsof het apparaat een nieuwe waarde stuurt. */
    stuur(byte: number) {
      kenmerk.value = new DataView(new Uint8Array([byte]).buffer);
      for (const fn of luisteraars['characteristicvaluechanged'] ?? []) fn({ target: kenmerk });
    },
  };
  return kenmerk;
}

interface ApparaatOpties {
  naam?: string;
  batterij?: number | null;
  hid?: boolean;
  gatt?: boolean;
}

/** Een bluetooth-apparaat zoals `requestDevice` het teruggeeft. */
function maakApparaat(opties: ApparaatOpties = {}) {
  // `naam` mag met opzet undefined zijn - een apparaat zonder naam is precies
  // een van de gevallen hieronder - dus geen standaardwaarde bij het uitpakken.
  const naam = 'naam' in opties ? opties.naam : 'AirTurn PED';
  const { batterij = 72, hid = true, gatt = true } = opties;
  const batterijKenmerk = maakKenmerk(batterij ?? 0);
  const hidKenmerk = maakKenmerk(0);
  const apparaatLuisteraars: Record<string, (() => void)[]> = {};

  const server = {
    getPrimaryService: vi.fn(async (dienst: string) => {
      if (dienst === 'battery_service') {
        if (batterij === null) throw new Error('geen batterijdienst');
        return { getCharacteristic: vi.fn(async () => batterijKenmerk) };
      }
      if (dienst === 'human_interface_device') {
        if (!hid) throw new Error('geen hid-dienst');
        return { getCharacteristic: vi.fn(async () => hidKenmerk) };
      }
      throw new Error(`onbekende dienst ${dienst}`);
    }),
  };

  const apparaat = {
    name: naam,
    gatt: gatt
      ? {
          connected: true,
          connect: vi.fn(async () => server),
          disconnect: vi.fn(() => {
            apparaat.gatt!.connected = false;
          }),
        }
      : undefined,
    addEventListener: vi.fn((soort: string, fn: () => void) => {
      (apparaatLuisteraars[soort] ??= []).push(fn);
    }),
    /** Doe alsof het apparaat uit bereik raakt. */
    valtWeg() {
      for (const fn of apparaatLuisteraars['gattserverdisconnected'] ?? []) fn();
    },
    batterijKenmerk,
    hidKenmerk,
  };

  return apparaat;
}

let requestDevice: ReturnType<typeof vi.fn>;

/** Zet `navigator.bluetooth` neer, of haal hem weg voor een browser zonder. */
function zetBluetooth(aanwezig: boolean) {
  if (!aanwezig) {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    return;
  }
  requestDevice = vi.fn();
  Object.defineProperty(navigator, 'bluetooth', {
    value: { requestDevice },
    configurable: true,
    writable: true,
  });
}

/** Doe alsof de lezer schermvullend staat (of juist niet). */
function zetSchermvullend(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
}

beforeEach(() => {
  zetBluetooth(true);
  zetSchermvullend(null);
});

afterEach(() => {
  zetBluetooth(false);
  zetSchermvullend(null);
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */
/* Wel of geen bluetooth in deze browser                               */
/* ------------------------------------------------------------------ */

describe('bluetooth-pedaal - beschikbaarheid', () => {
  it('meldt dat het kan zodra de browser bluetooth kent', async () => {
    const { result } = renderHook(() => useBluetoothPedal());

    await waitFor(() => expect(result.current.isSupported).toBe(true));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.deviceName).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('meldt dat het niet kan in een browser zonder bluetooth', async () => {
    zetBluetooth(false);

    const { result } = renderHook(() => useBluetoothPedal());

    await waitFor(() => expect(result.current.isSupported).toBe(false));
  });

  it('geeft een uitleg in plaats van een crash als er toch op koppelen gedrukt wordt', async () => {
    zetBluetooth(false);
    const { result } = renderHook(() => useBluetoothPedal());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe('Bluetooth not supported');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Koppelen                                                            */
/* ------------------------------------------------------------------ */

describe('bluetooth-pedaal - koppelen', () => {
  it('koppelt aan het gekozen apparaat en toont naam en batterijstand', async () => {
    const apparaat = maakApparaat({ naam: 'PageFlip Firefly', batterij: 72 });
    requestDevice.mockResolvedValue(apparaat);

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.deviceName).toBe('PageFlip Firefly');
    expect(result.current.batteryLevel).toBe(72);
    expect(result.current.error).toBeNull();

    // De hook vraagt de browser om elk apparaat te tonen, want een pedaal
    // meldt zich niet altijd met een herkenbare dienst.
    expect(requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptAllDevices: true,
        optionalServices: expect.arrayContaining([expect.any(String)]),
      }),
    );
    expect(apparaat.gatt?.connect).toHaveBeenCalled();
  });

  it('houdt het bij "Unknown Device" als het apparaat geen naam doorgeeft', async () => {
    requestDevice.mockResolvedValue(maakApparaat({ naam: undefined }));

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.deviceName).toBe('Unknown Device');
  });

  it('koppelt gewoon door als het apparaat geen batterijdienst heeft', async () => {
    requestDevice.mockResolvedValue(maakApparaat({ batterij: null }));

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.batteryLevel).toBeNull();
  });

  it('koppelt gewoon door als het apparaat geen HID-dienst heeft', async () => {
    // Zulke pedalen doen zich voor als toetsenbord; daar is de toetsenluisteraar voor.
    requestDevice.mockResolvedValue(maakApparaat({ hid: false }));

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('meldt zich verbonden ook als er helemaal geen GATT-server is', async () => {
    requestDevice.mockResolvedValue(maakApparaat({ gatt: false }));

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.batteryLevel).toBeNull();
  });

  it('legt zich erbij neer als de gebruiker het koppelen afbreekt', async () => {
    // Dit is wat de browser teruggeeft als de gebruiker het keuzevenster
    // wegklikt: een afwijzing, geen apparaat.
    requestDevice.mockRejectedValue(new Error('User cancelled the requestDevice() chooser.'));

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBe('User cancelled the requestDevice() chooser.');
  });

  it('heeft ook een melding als de afwijzing geen tekst bij zich heeft', async () => {
    requestDevice.mockRejectedValue({});

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe('Failed to connect');
  });

  it('wist een eerdere foutmelding bij een nieuwe poging', async () => {
    requestDevice.mockRejectedValueOnce(new Error('afgebroken'));
    const { result } = renderHook(() => useBluetoothPedal());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toBe('afgebroken');

    requestDevice.mockResolvedValue(maakApparaat());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Ontkoppelen en wegvallen                                            */
/* ------------------------------------------------------------------ */

describe('bluetooth-pedaal - verbinding kwijt', () => {
  it('laat los als de gebruiker op ontkoppelen drukt', async () => {
    const apparaat = maakApparaat();
    requestDevice.mockResolvedValue(apparaat);

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });

    act(() => result.current.disconnect());

    expect(apparaat.gatt?.disconnect).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.deviceName).toBeNull();
    expect(result.current.batteryLevel).toBeNull();
  });

  it('doet niets vervelends bij ontkoppelen zonder apparaat', async () => {
    const { result } = renderHook(() => useBluetoothPedal());

    act(() => result.current.disconnect());

    expect(result.current.isConnected).toBe(false);
  });

  it('merkt het als het pedaal uit bereik raakt', async () => {
    const apparaat = maakApparaat();
    requestDevice.mockResolvedValue(apparaat);

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => apparaat.valtWeg());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.deviceName).toBeNull();
    expect(result.current.batteryLevel).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* De voetknoppen                                                      */
/* ------------------------------------------------------------------ */

describe('bluetooth-pedaal - HID-rapporten', () => {
  /** Koppel en geef het HID-kenmerk terug, waar de nepbytes doorheen gaan. */
  async function gekoppeld(handelingen: {
    onPageNext?: () => void;
    onPagePrevious?: () => void;
    onCustomAction?: (actie: string) => void;
  }) {
    const apparaat = maakApparaat();
    requestDevice.mockResolvedValue(apparaat);
    const { result } = renderHook(() => useBluetoothPedal(handelingen));
    await act(async () => {
      await result.current.connect();
    });
    return { apparaat, result };
  }

  it('bladert vooruit bij de rechtervoetknop', async () => {
    const volgende = vi.fn();
    const vorige = vi.fn();
    const { apparaat } = await gekoppeld({ onPageNext: volgende, onPagePrevious: vorige });

    act(() => apparaat.hidKenmerk.stuur(0x01));
    expect(volgende).toHaveBeenCalledTimes(1);

    // 0x4f is de HID-code voor pijl-rechts; sommige pedalen sturen die.
    act(() => apparaat.hidKenmerk.stuur(0x4f));
    expect(volgende).toHaveBeenCalledTimes(2);
    expect(vorige).not.toHaveBeenCalled();
  });

  it('bladert terug bij de linkervoetknop', async () => {
    const volgende = vi.fn();
    const vorige = vi.fn();
    const { apparaat } = await gekoppeld({ onPageNext: volgende, onPagePrevious: vorige });

    act(() => apparaat.hidKenmerk.stuur(0x02));
    act(() => apparaat.hidKenmerk.stuur(0x50));

    expect(vorige).toHaveBeenCalledTimes(2);
    expect(volgende).not.toHaveBeenCalled();
  });

  it('geeft een onbekende knop door aan wie er raad mee weet', async () => {
    const eigen = vi.fn();
    const volgende = vi.fn();
    const { apparaat } = await gekoppeld({ onCustomAction: eigen, onPageNext: volgende });

    act(() => apparaat.hidKenmerk.stuur(0x2c));

    expect(eigen).toHaveBeenCalledWith('0x2c');
    expect(volgende).not.toHaveBeenCalled();
  });

  it('doet niets bij het loslaten van een knop', async () => {
    // Een pedaal stuurt bij loslaten een rapport met alleen nullen.
    const volgende = vi.fn();
    const vorige = vi.fn();
    const eigen = vi.fn();
    const { apparaat } = await gekoppeld({ onPageNext: volgende, onPagePrevious: vorige, onCustomAction: eigen });

    act(() => apparaat.hidKenmerk.stuur(0x00));

    expect(volgende).not.toHaveBeenCalled();
    expect(vorige).not.toHaveBeenCalled();
    expect(eigen).not.toHaveBeenCalled();
  });

  it('houdt de batterijstand bij terwijl het pedaal leegloopt', async () => {
    const apparaat = maakApparaat({ batterij: 80 });
    requestDevice.mockResolvedValue(apparaat);

    const { result } = renderHook(() => useBluetoothPedal());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.batteryLevel).toBe(80);

    act(() => apparaat.batterijKenmerk.stuur(31));

    expect(result.current.batteryLevel).toBe(31);
  });
});

/* ------------------------------------------------------------------ */
/* Pedalen die zich als toetsenbord voordoen                           */
/* ------------------------------------------------------------------ */

describe('bluetooth-pedaal - toetsenbordpedalen', () => {
  /** Druk een toets in op het opgegeven doel (standaard het document zelf). */
  function toets(key: string, doel: EventTarget = window) {
    const gebeurtenis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    doel.dispatchEvent(gebeurtenis);
    return gebeurtenis;
  }

  it('luistert pas naar toetsen als er een pedaal gekoppeld is', async () => {
    const volgende = vi.fn();
    const { result } = renderHook(() => useBluetoothPedal({ onPageNext: volgende }));
    await waitFor(() => expect(result.current.isSupported).toBe(true));

    toets('ArrowRight');
    expect(volgende).not.toHaveBeenCalled();

    requestDevice.mockResolvedValue(maakApparaat());
    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      toets('ArrowRight');
    });
    expect(volgende).toHaveBeenCalledTimes(1);
  });

  it('luistert ook zonder koppeling zolang de lezer schermvullend staat', async () => {
    zetSchermvullend(document.body);
    const volgende = vi.fn();
    const vorige = vi.fn();
    renderHook(() => useBluetoothPedal({ onPageNext: volgende, onPagePrevious: vorige }));

    act(() => {
      toets('PageDown');
      toets('PageUp');
    });

    expect(volgende).toHaveBeenCalledTimes(1);
    expect(vorige).toHaveBeenCalledTimes(1);
  });

  it('kent alle toetsen die een pedaal kan sturen', async () => {
    zetSchermvullend(document.body);
    const volgende = vi.fn();
    const vorige = vi.fn();
    renderHook(() => useBluetoothPedal({ onPageNext: volgende, onPagePrevious: vorige }));

    act(() => {
      for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) toets(k);
    });
    expect(volgende).toHaveBeenCalledTimes(5);

    act(() => {
      for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) toets(k);
    });
    expect(vorige).toHaveBeenCalledTimes(4);
  });

  it('houdt de browser tegen zodat de bladzijde niet ook nog wegscrolt', async () => {
    zetSchermvullend(document.body);
    renderHook(() => useBluetoothPedal({ onPageNext: vi.fn() }));

    let gebeurtenis!: KeyboardEvent;
    act(() => {
      gebeurtenis = toets(' ');
    });

    expect(gebeurtenis.defaultPrevented).toBe(true);
  });

  it('laat toetsen die geen pedaalknop zijn met rust', async () => {
    zetSchermvullend(document.body);
    const volgende = vi.fn();
    const vorige = vi.fn();
    renderHook(() => useBluetoothPedal({ onPageNext: volgende, onPagePrevious: vorige }));

    let gebeurtenis!: KeyboardEvent;
    act(() => {
      gebeurtenis = toets('a');
    });

    expect(volgende).not.toHaveBeenCalled();
    expect(vorige).not.toHaveBeenCalled();
    expect(gebeurtenis.defaultPrevented).toBe(false);
  });

  /**
   * BEWIJS - typen naast een gekoppeld pedaal.
   *
   * De toetsenluisteraar hangt aan `window` en keek alleen of er een pedaal
   * gekoppeld was, niet waar de toets terechtkwam. Met een pedaal aan stond
   * elk invoerveld in de app op slot: spatie en Enter werden opgeslokt en
   * omgezet in "volgende bladzijde", Backspace in "vorige". Wie tijdens de
   * repetitie een aantekening intypte kreeg "Tempoaanhouden" en zag de
   * bladmuziek onder zijn handen wegbladeren.
   *
   * De reparatie: toetsen die in een invoerveld, een tekstvak, een keuzelijst
   * of een bewerkbaar element landen blijven van de pedaalluisteraar af.
   * Precies de uitzondering die AnnotationToolbar.tsx al had.
   *
   * Op de oude code is deze test rood: `volgende` werd tweemaal aangeroepen
   * en de spatie kwam nooit in het veld aan. Nagekeken door
   * useBluetoothPedal.ts op HEAD terug te zetten en deze test te draaien.
   */
  it('blijft van de toetsen af terwijl de gebruiker in een veld typt', async () => {
    const volgende = vi.fn();
    const vorige = vi.fn();
    const { result } = renderHook(() => useBluetoothPedal({ onPageNext: volgende, onPagePrevious: vorige }));

    requestDevice.mockResolvedValue(maakApparaat());
    await act(async () => {
      await result.current.connect();
    });

    const veld = document.createElement('input');
    document.body.appendChild(veld);
    veld.focus();

    let spatie!: KeyboardEvent;
    act(() => {
      spatie = toets(' ', veld);
      toets('Backspace', veld);
    });

    expect(volgende).not.toHaveBeenCalled();
    expect(vorige).not.toHaveBeenCalled();
    // En de spatie komt gewoon in het veld terecht.
    expect(spatie.defaultPrevented).toBe(false);
  });

  it('blijft ook van de toetsen af in een tekstvak en in bewerkbare tekst', async () => {
    zetSchermvullend(document.body);
    const volgende = vi.fn();
    renderHook(() => useBluetoothPedal({ onPageNext: volgende }));

    const tekstvak = document.createElement('textarea');
    const bewerkbaar = document.createElement('div');
    bewerkbaar.setAttribute('contenteditable', 'true');
    document.body.append(tekstvak, bewerkbaar);

    act(() => {
      toets(' ', tekstvak);
      toets('Enter', bewerkbaar);
    });

    expect(volgende).not.toHaveBeenCalled();
  });

  it('gebruikt de handelingen van de laatste tekening, niet die van de eerste', async () => {
    // De hook bewaart de handelingen in een ref. Zonder die ref zou een lezer
    // die opnieuw tekent met een verse `onPageNext` op de oude blijven zitten.
    zetSchermvullend(document.body);
    const eerste = vi.fn();
    const tweede = vi.fn();
    const { rerender } = renderHook(({ fn }) => useBluetoothPedal({ onPageNext: fn }), {
      initialProps: { fn: eerste },
    });

    rerender({ fn: tweede });

    act(() => {
      toets('ArrowRight');
    });

    expect(eerste).not.toHaveBeenCalled();
    expect(tweede).toHaveBeenCalledTimes(1);
  });

  it('luistert niet meer nadat de lezer weg is', async () => {
    zetSchermvullend(document.body);
    const volgende = vi.fn();
    const { unmount } = renderHook(() => useBluetoothPedal({ onPageNext: volgende }));

    unmount();
    toets('ArrowRight');

    expect(volgende).not.toHaveBeenCalled();
  });
});
