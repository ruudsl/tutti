/**
 * De CAPTCHA-omhulling rond hCaptcha.
 *
 * Dit component doet drie dingen die de bezoeker raken: het haalt een script
 * van een derde binnen, het tekent daar een widget mee, en het geeft de uitslag
 * door aan het formulier eromheen. Elk van die drie kan misgaan zonder dat er
 * iets op het scherm verandert, en juist daarom staat het hier vast.
 *
 * VASTGELEGD, NIET VERANDERD: bij een storing valt de CAPTCHA open. Deze
 * omhulling blokkeert namelijk niets uit zichzelf - laadt het script niet, dan
 * meldt hij dat via `onError` en houdt hij verder zijn mond; er komt geen
 * token, geen foutmelding in beeld, geen slot op het formulier. Wat er dan
 * gebeurt beslist de aanroeper (TicketPurchase zet zijn verstuurknop op slot)
 * en, aan de serverkant, `services/captcha.ts`, die verificatie overslaat als
 * er geen sleutel is ingesteld. Dat is een bewuste keuze en die blijft zo. De
 * tests hieronder leggen hem vast zodat een latere wijziging hem niet per
 * ongeluk omdraait; ze schrijven niet voor dat het anders moet.
 *
 * Getest wordt wat de bezoeker ziet en doet: het vakje verschijnt met de juiste
 * taal en het juiste thema, het afronden van de puzzel geeft een token door,
 * een verlopen token wordt gemeld, en het wegnavigeren ruimt de widget op.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, configure, act } from '@testing-library/react';
import CaptchaWidget, { useCaptcha } from '../CaptchaWidget';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, terugval?: string) => terugval || sleutel,
    i18n: { language: 'nl-NL' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

type RenderParams = Parameters<NonNullable<Window['hcaptcha']>['render']>[1];

/** Een dubbelganger voor het globale hcaptcha-object dat het script neerzet. */
function maakHcaptcha() {
  return {
    render: vi.fn<(container: string | HTMLElement, params: RenderParams) => string>(() => 'widget-1'),
    reset: vi.fn(),
    remove: vi.fn(),
    getResponse: vi.fn(() => ''),
    execute: vi.fn(),
  };
}

let hcaptcha: ReturnType<typeof maakHcaptcha>;

/** De laatste parameters waarmee de widget getekend is. */
function laatsteParams(): RenderParams {
  return hcaptcha.render.mock.calls[hcaptcha.render.mock.calls.length - 1][1];
}

/** Het scripttag dat het component zelf in de pagina hangt. */
function scriptTag(): HTMLScriptElement | null {
  return document.getElementById('hcaptcha-script') as HTMLScriptElement | null;
}

/** Zet het systeemthema vast; jsdom heeft matchMedia niet uit zichzelf. */
function stelSysteemthemaIn(donker: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: donker && query.includes('dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  hcaptcha = maakHcaptcha();
  delete window.hcaptcha;
  delete window.onHCaptchaLoaded;
  scriptTag()?.remove();
  stelSysteemthemaIn(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CaptchaWidget, als het script er al is', () => {
  beforeEach(() => {
    window.hcaptcha = hcaptcha;
  });

  it('tekent het vakje met de sleutel, de taal en het formaat van de aanroeper', async () => {
    render(<CaptchaWidget siteKey="sleutel-van-de-vereniging" onVerify={vi.fn()} size="compact" />);

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalledTimes(1));
    const params = laatsteParams();
    expect(params.sitekey).toBe('sleutel-van-de-vereniging');
    expect(params.size).toBe('compact');
    // 'nl-NL' uit i18n wordt de taalcode die hCaptcha kent.
    expect(params.hl).toBe('nl');
  });

  it('laat de aanroeper de taal overrulen', async () => {
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} language="de" />);

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());
    expect(laatsteParams().hl).toBe('de');
  });

  it('volgt het systeemthema als er geen thema is opgegeven', async () => {
    stelSysteemthemaIn(true);
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());
    expect(laatsteParams().theme).toBe('dark');
  });

  it('gebruikt het opgegeven thema en kijkt dan niet naar het systeem', async () => {
    stelSysteemthemaIn(true);
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} theme="light" />);

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());
    expect(laatsteParams().theme).toBe('light');
  });

  it('geeft het token door zodra de bezoeker de puzzel oplost', async () => {
    const geverifieerd = vi.fn();
    render(<CaptchaWidget siteKey="s" onVerify={geverifieerd} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    act(() => laatsteParams().callback?.('token-uit-de-puzzel'));

    expect(geverifieerd).toHaveBeenCalledWith('token-uit-de-puzzel');
  });

  it('meldt zowel een verlopen token als een verlopen uitdaging', async () => {
    const verlopen = vi.fn();
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} onExpire={verlopen} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    act(() => laatsteParams()['expired-callback']?.());
    act(() => laatsteParams()['chalexpired-callback']?.());

    expect(verlopen).toHaveBeenCalledTimes(2);
  });

  it('geeft een fout van hCaptcha door aan de aanroeper', async () => {
    const gefaald = vi.fn();
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} onError={gefaald} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    const fout = new Error('netwerk weg');
    act(() => laatsteParams()['error-callback']?.(fout));

    expect(gefaald).toHaveBeenCalledWith(fout);
  });

  it('werkt ook zonder onExpire en onError; die zijn optioneel', async () => {
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    expect(() => {
      act(() => laatsteParams()['expired-callback']?.());
      act(() => laatsteParams()['error-callback']?.(new Error('x')));
    }).not.toThrow();
  });

  it('ruimt de widget op als de bezoeker wegnavigeert', async () => {
    const { unmount } = render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    unmount();

    expect(hcaptcha.remove).toHaveBeenCalledWith('widget-1');
  });

  it('laat het opruimen niet klappen als hCaptcha de widget al kwijt is', async () => {
    hcaptcha.remove.mockImplementation(() => {
      throw new Error('onbekende widget');
    });
    const { unmount } = render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    expect(() => unmount()).not.toThrow();
  });

  it('biedt het formulier eromheen een manier om het vakje leeg te maken', async () => {
    const { container } = render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} className="eigen-klasse" />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalled());

    const vakje = container.querySelector('.captcha-widget') as HTMLElement;
    expect(vakje.className).toContain('eigen-klasse');
    const doel = vakje.firstElementChild as HTMLDivElement & { resetCaptcha?: () => void };
    act(() => doel.resetCaptcha?.());

    expect(hcaptcha.reset).toHaveBeenCalledWith('widget-1');
  });

  it('tekent opnieuw als de vereniging een andere sleutel krijgt', async () => {
    const onVerify = vi.fn();
    const { rerender } = render(<CaptchaWidget siteKey="eerste" onVerify={onVerify} />);
    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalledTimes(1));

    rerender(<CaptchaWidget siteKey="tweede" onVerify={onVerify} />);

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalledTimes(2));
    expect(laatsteParams().sitekey).toBe('tweede');
  });

  it('benoemt het vakje voor wie het scherm niet ziet', async () => {
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);

    expect(await screen.findByLabelText('Please complete the CAPTCHA verification')).toBeInTheDocument();
  });
});

describe('CaptchaWidget, terwijl het script nog moet komen', () => {
  it('hangt het script eenmalig in de pagina en tekent zodra het geladen is', async () => {
    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);

    await waitFor(() => expect(scriptTag()).not.toBeNull());
    expect(scriptTag()!.src).toContain('js.hcaptcha.com');
    expect(scriptTag()!.src).toContain('render=explicit');
    expect(hcaptcha.render).not.toHaveBeenCalled();

    // Het script zet het globale object neer en roept de terugmelding aan.
    window.hcaptcha = hcaptcha;
    await act(async () => {
      window.onHCaptchaLoaded?.();
    });

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalledTimes(1));
  });

  it('hangt geen tweede script op als er al een aan het laden is', async () => {
    const bestaand = document.createElement('script');
    bestaand.id = 'hcaptcha-script';
    document.head.appendChild(bestaand);

    render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} />);

    await waitFor(() => expect(window.onHCaptchaLoaded).toBeTypeOf('function'));
    expect(document.querySelectorAll('#hcaptcha-script')).toHaveLength(1);

    window.hcaptcha = hcaptcha;
    await act(async () => {
      window.onHCaptchaLoaded?.();
    });

    await waitFor(() => expect(hcaptcha.render).toHaveBeenCalledTimes(1));
    bestaand.remove();
  });

  /**
   * VASTGELEGD GEDRAG, geen wens tot verandering. Zie de kop van dit bestand:
   * bij een storing valt de CAPTCHA open. Deze test schrijft precies op wat het
   * component dan wél doet - melden - en wat het niet doet: het zet zelf geen
   * slot op de pagina en toont zelf geen foutmelding.
   */
  it('meldt een mislukte scriptlading en laat het slot verder aan de aanroeper', async () => {
    const gefaald = vi.fn();
    const geverifieerd = vi.fn();
    const { container } = render(<CaptchaWidget siteKey="s" onVerify={geverifieerd} onError={gefaald} />);

    await waitFor(() => expect(scriptTag()).not.toBeNull());
    await act(async () => {
      scriptTag()!.dispatchEvent(new Event('error'));
    });

    await waitFor(() => expect(gefaald).toHaveBeenCalledTimes(1));
    expect(gefaald.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((gefaald.mock.calls[0][0] as Error).message).toBe('Failed to load hCaptcha script');
    // Geen token, dus de aanroeper weet dat er niets geverifieerd is.
    expect(geverifieerd).not.toHaveBeenCalled();
    // En het component zelf toont geen blokkade: het vakje blijft leeg staan.
    expect(container.querySelector('.captcha-widget')!.textContent).toBe('');
  });

  it('meldt niets meer als de bezoeker al weg is voordat het script faalt', async () => {
    const gefaald = vi.fn();
    const { unmount } = render(<CaptchaWidget siteKey="s" onVerify={vi.fn()} onError={gefaald} />);
    await waitFor(() => expect(scriptTag()).not.toBeNull());

    const script = scriptTag()!;
    unmount();
    await act(async () => {
      script.dispatchEvent(new Event('error'));
    });

    expect(gefaald).not.toHaveBeenCalled();
  });
});

describe('useCaptcha', () => {
  function Proefformulier() {
    const { setToken, getToken, clearToken } = useCaptcha();
    return (
      <div>
        <button onClick={() => setToken('token-abc')}>bewaren</button>
        <button onClick={() => clearToken()}>wissen</button>
        <output>{getToken() ?? 'geen'}</output>
      </div>
    );
  }

  it('bewaart het token tussen renders en geeft het weer vrij', async () => {
    const { rerender } = render(<Proefformulier />);
    expect(screen.getByRole('status')).toHaveTextContent('geen');

    act(() => screen.getByRole('button', { name: 'bewaren' }).click());
    rerender(<Proefformulier />);
    expect(screen.getByRole('status')).toHaveTextContent('token-abc');

    act(() => screen.getByRole('button', { name: 'wissen' }).click());
    rerender(<Proefformulier />);
    expect(screen.getByRole('status')).toHaveTextContent('geen');
  });
});
