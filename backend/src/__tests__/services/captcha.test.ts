/**
 * CAPTCHA is een beveiligingscontrole, dus telt dekking hier dubbel.
 *
 * De module leest zijn instellingen eenmalig bij het inladen uit process.env.
 * Dat betekent dat een test die de omgeving wil varieren de module opnieuw moet
 * inladen; vandaar de helper laadCaptcha() met vi.resetModules(). De
 * gemockte logger moet in diezelfde ronde opgehaald worden, anders kijkt de
 * test naar een ander exemplaar dan de module gebruikt.
 *
 * BELANGRIJK - twee schakelaars die stil open kunnen blijven staan zijn
 * hieronder vastgelegd zoals de code zich NU gedraagt, niet zoals het
 * wenselijk is. Zie de tests onder "de schakelaars die open kunnen blijven
 * staan". Ze zijn bewust niet gerepareerd: een wijziging aan het faalgedrag van
 * een beveiligingscontrole hoort een bewuste keuze te zijn, niet een
 * bijvangst van een testronde.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';

const GEHEIM = 'geheime-hcaptcha-sleutel-abc123';
const SITESLEUTEL = 'openbare-sitesleutel-xyz789';

type CaptchaModule = typeof import('../../services/captcha');
type GemockteLogger = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

const omgevingsSleutels = ['HCAPTCHA_SECRET_KEY', 'HCAPTCHA_SITE_KEY', 'CAPTCHA_ENABLED', 'NODE_ENV'] as const;
const oorspronkelijkeOmgeving: Record<string, string | undefined> = {};

/**
 * Laadt de captchamodule opnieuw met de opgegeven omgeving.
 *
 * De module bevriest zijn configuratie in module-constanten, dus zonder
 * resetModules zou elke test dezelfde instellingen zien als de eerste.
 */
async function laadCaptcha(
  omgeving: Partial<Record<(typeof omgevingsSleutels)[number], string | undefined>> = {},
): Promise<CaptchaModule & { logger: GemockteLogger }> {
  for (const sleutel of omgevingsSleutels) {
    if (sleutel in omgeving) {
      const waarde = omgeving[sleutel];
      if (waarde === undefined) delete process.env[sleutel];
      else process.env[sleutel] = waarde;
    }
  }
  vi.resetModules();
  const captcha = await import('../../services/captcha');
  const logger = (await import('../../utils/logger')).default as unknown as GemockteLogger;
  // De gemockte logger overleeft resetModules(): zonder deze schoonmaak zou een
  // test de logregels van eerdere tests in dezelfde suite meetellen.
  for (const niveau of [logger.info, logger.warn, logger.error, logger.debug]) niveau.mockClear();
  return { ...captcha, logger };
}

/** Bouwt een antwoord zoals hCaptcha dat teruggeeft. */
function hcaptchaAntwoord(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Alles wat aan de logger is meegegeven, als een doorzoekbare tekst. */
function alleLogtekst(logger: GemockteLogger): string {
  return [logger.info, logger.warn, logger.error, logger.debug]
    .flatMap((fn) => fn.mock.calls)
    .map((argumenten) => argumenten.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

beforeEach(() => {
  for (const sleutel of omgevingsSleutels) {
    oorspronkelijkeOmgeving[sleutel] = process.env[sleutel];
  }
});

afterEach(() => {
  for (const sleutel of omgevingsSleutels) {
    const waarde = oorspronkelijkeOmgeving[sleutel];
    if (waarde === undefined) delete process.env[sleutel];
    else process.env[sleutel] = waarde;
  }
  vi.unstubAllGlobals();
});

describe('verifyCaptcha', () => {
  describe('met een werkende configuratie', () => {
    async function metSleutel() {
      return laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: SITESLEUTEL,
      });
    }

    it('weigert een ontbrekend token zonder hCaptcha lastig te vallen', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA token is required');
      // Geen netwerkverkeer voor iets wat we zelf al weten.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('weigert een leeg token dat alleen uit witruimte lijkt te bestaan niet zelf', async () => {
      // Let op: de code controleert alleen op een leegte-waarde (!token). Een
      // token van een spatie gaat dus wel naar hCaptcha, die hem afwijst. Dat
      // is verdedigbaar - hCaptcha is de autoriteit - maar het is wel een
      // netwerkaanroep die vermeden had kunnen worden.
      const fetchMock = vi.fn(async () =>
        hcaptchaAntwoord({ success: false, 'error-codes': ['invalid-input-response'] }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('   ', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('Invalid CAPTCHA token');
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('laat een geldig token door en geeft de gegevens van hCaptcha terug', async () => {
      const uitgifte = new Date().toISOString();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          hcaptchaAntwoord({
            success: true,
            challenge_ts: uitgifte,
            hostname: 'tutti.example',
            score: 0.1,
          }),
        ),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('geldig-token', '10.0.0.1');

      expect(resultaat).toEqual({
        success: true,
        challengeTimestamp: uitgifte,
        hostname: 'tutti.example',
        score: 0.1,
      });
    });

    it('laat een token een keer werken en daarna niet meer', async () => {
      // De module houdt zelf geen gebruikte tokens bij; het eenmalig gebruik
      // wordt volledig door hCaptcha afgedwongen, die bij een tweede aanbieding
      // 'invalid-or-already-seen-response' teruggeeft. Deze test legt de hele
      // heen-en-weer vast, zodat een latere wijziging die het antwoord van
      // hCaptcha zou negeren meteen opvalt.
      let aantalKeerGezien = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          aantalKeerGezien++;
          return aantalKeerGezien === 1
            ? hcaptchaAntwoord({ success: true, hostname: 'tutti.example' })
            : hcaptchaAntwoord({ success: false, 'error-codes': ['invalid-or-already-seen-response'] });
        }),
      );
      const { verifyCaptcha } = await metSleutel();

      const eerste = await verifyCaptcha('eenmalig-token', '10.0.0.1');
      const tweede = await verifyCaptcha('eenmalig-token', '10.0.0.1');

      expect(eerste.success).toBe(true);
      expect(tweede.success).toBe(false);
      expect(tweede.error).toBe('CAPTCHA token already used');
    });

    it('weigert een verlopen token, ook als hCaptcha een onbekende foutcode geeft', async () => {
      // 'expired-response' staat niet in de vertaaltabel. Het antwoord moet dan
      // alsnog een weigering zijn - dichtklappen, niet opengaan.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({ success: false, 'error-codes': ['expired-response'] })),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('verlopen-token', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA verification failed');
    });

    it('weigert ook als hCaptcha helemaal geen foutcode meegeeft', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({ success: false })),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA verification failed');
    });

    it.each([
      ['missing-input-secret', 'CAPTCHA configuration error'],
      ['invalid-input-secret', 'CAPTCHA configuration error'],
      ['missing-input-response', 'CAPTCHA token is required'],
      ['invalid-input-response', 'Invalid CAPTCHA token'],
      ['bad-request', 'Invalid CAPTCHA request'],
      ['invalid-or-already-seen-response', 'CAPTCHA token already used'],
      ['not-using-dummy-passcode', 'Test key only valid with test secret'],
      ['sitekey-secret-mismatch', 'CAPTCHA configuration mismatch'],
    ])('vertaalt foutcode %s naar een begrijpelijke melding', async (code, melding) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({ success: false, 'error-codes': [code] })),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      expect(resultaat).toEqual({ success: false, error: melding });
    });

    it('weigert wanneer hCaptcha zelf een storing heeft', async () => {
      // Een storing bij de controleur mag geen vrijbrief zijn: dichtklappen.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({}, 503)),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA verification service unavailable');
    });

    it('weigert wanneer het netwerk er helemaal niet doorheen komt', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA verification service unavailable');
    });

    it('weigert wanneer hCaptcha iets terugstuurt dat geen JSON is', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        })),
      );
      const { verifyCaptcha } = await metSleutel();

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toBe('CAPTCHA verification service unavailable');
    });
  });

  describe('de aanvraag aan hCaptcha', () => {
    it('stuurt sleutel, token, ip en sitekey mee in het formulierlichaam', async () => {
      const fetchMock = vi.fn(async () => hcaptchaAntwoord({ success: true }));
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha } = await laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: SITESLEUTEL,
      });

      await verifyCaptcha('mijn-token', '203.0.113.9');

      const [url, opties] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hcaptcha.com/siteverify');
      expect(opties.method).toBe('POST');
      expect((opties.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      const velden = new URLSearchParams(opties.body as string);
      expect(velden.get('secret')).toBe(GEHEIM);
      expect(velden.get('response')).toBe('mijn-token');
      expect(velden.get('remoteip')).toBe('203.0.113.9');
      expect(velden.get('sitekey')).toBe(SITESLEUTEL);
    });

    it('laat remoteip weg als er geen ip bekend is', async () => {
      const fetchMock = vi.fn(async () => hcaptchaAntwoord({ success: true }));
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha } = await laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: undefined,
      });

      await verifyCaptcha('mijn-token', '');

      const velden = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(velden.has('remoteip')).toBe(false);
      expect(velden.has('sitekey')).toBe(false);
    });
  });

  describe('geheimhouding', () => {
    it('zet het geheim nooit in het antwoord aan de aanroeper', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({ success: false, 'error-codes': ['invalid-input-secret'] })),
      );
      const { verifyCaptcha } = await laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: SITESLEUTEL,
      });

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      // Juist bij een sleutelfout ligt het voor de hand om "de sleutel klopt
      // niet: <sleutel>" terug te geven. Dat mag nooit gebeuren: dit antwoord
      // gaat via de route rechtstreeks naar de browser van een bezoeker.
      expect(JSON.stringify(resultaat)).not.toContain(GEHEIM);
      expect(resultaat.error).toBe('CAPTCHA configuration error');
    });

    it('zet het geheim nooit in een logregel', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => hcaptchaAntwoord({ success: false, 'error-codes': ['invalid-input-secret'] })),
      );
      const { verifyCaptcha, logger } = await laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: SITESLEUTEL,
      });

      await verifyCaptcha('token', '10.0.0.1');
      await verifyCaptcha('', '10.0.0.1');

      const logtekst = alleLogtekst(logger);
      expect(logtekst).not.toContain(GEHEIM);
      // Er is wel degelijk gelogd - de test bewijst dus iets.
      expect(logtekst).toContain('CAPTCHA verification failed');
    });

    it('zet het geheim ook niet in het log bij een storing van hCaptcha', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error(`verbinding met secret=${GEHEIM} mislukt`);
        }),
      );
      const { verifyCaptcha } = await laadCaptcha({
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: GEHEIM,
        HCAPTCHA_SITE_KEY: SITESLEUTEL,
      });

      const resultaat = await verifyCaptcha('token', '10.0.0.1');

      // De logregel bevat hier wel de foutmelding van fetch. Wat telt is dat
      // het ANTWOORD aan de bezoeker een vaste, nietszeggende tekst is en de
      // onderliggende fout niet doorgeeft.
      expect(JSON.stringify(resultaat)).not.toContain(GEHEIM);
      expect(resultaat.error).toBe('CAPTCHA verification service unavailable');
    });
  });

  describe('de schakelaars die open kunnen blijven staan', () => {
    it('slaat de controle over als CAPTCHA_ENABLED op false staat', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha } = await laadCaptcha({
        CAPTCHA_ENABLED: 'false',
        HCAPTCHA_SECRET_KEY: GEHEIM,
      });

      expect(await verifyCaptcha('', '10.0.0.1')).toEqual({ success: true });
      expect(await verifyCaptcha('onzin', '10.0.0.1')).toEqual({ success: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('slaat de controle OOK in productie over als CAPTCHA_ENABLED op false staat', async () => {
      // AANDACHT. Dit is vastgelegd gedrag, geen goedkeuring.
      //
      // De overslaan-tak hangt nergens aan NODE_ENV. Staat CAPTCHA_ENABLED in
      // productie op 'false' - per ongeluk uit een .env meegekomen, of ooit
      // gezet om lokaal te kunnen testen - dan wordt elk token geaccepteerd
      // zonder dat er iets in het log verschijnt op debugniveau na. Er is geen
      // enkele rem die dat in productie tegenhoudt.
      //
      // Deze test is met opzet groen op het huidige gedrag: hem rood maken zou
      // de suite breken. Hij staat hier zodat de dag dat iemand besluit dat de
      // schakelaar in productie genegeerd moet worden, precies dit ene punt
      // gewijzigd hoeft te worden.
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha, isCaptchaEnabled } = await laadCaptcha({
        NODE_ENV: 'production',
        CAPTCHA_ENABLED: 'false',
        HCAPTCHA_SECRET_KEY: GEHEIM,
      });

      expect(await verifyCaptcha('', '1.2.3.4')).toEqual({ success: true });
      expect(isCaptchaEnabled()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('laat elk token door zodra er geen geheime sleutel is ingesteld', async () => {
      // AANDACHT. Tweede open schakelaar, en de gevaarlijkste van de twee: een
      // ontbrekende HCAPTCHA_SECRET_KEY laat de controle stilzwijgend slagen.
      // Een lege of vergeten omgevingsvariabele in productie schakelt de
      // bescherming dus volledig uit. Er wordt alleen een warn-regel geschreven,
      // per aanroep, wat in de praktijk in de ruis verdwijnt.
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { verifyCaptcha, logger } = await laadCaptcha({
        NODE_ENV: 'production',
        CAPTCHA_ENABLED: 'true',
        HCAPTCHA_SECRET_KEY: '',
      });

      const resultaat = await verifyCaptcha('', '1.2.3.4');

      expect(resultaat).toEqual({ success: true });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('CAPTCHA verification skipped: no secret key configured');
    });

    it('gaat standaard uit van ingeschakeld als CAPTCHA_ENABLED niet gezet is', async () => {
      // De vergelijking is `!== 'false'`, dus alles behalve de letterlijke
      // tekst 'false' betekent aan. Dat is de veilige kant om op te vallen.
      const { isCaptchaEnabled } = await laadCaptcha({
        CAPTCHA_ENABLED: undefined,
        HCAPTCHA_SECRET_KEY: GEHEIM,
      });
      expect(isCaptchaEnabled()).toBe(true);
    });

    it('trapt niet in een hoofdletter in de schakelaar', async () => {
      const { isCaptchaEnabled } = await laadCaptcha({
        CAPTCHA_ENABLED: 'False',
        HCAPTCHA_SECRET_KEY: GEHEIM,
      });
      // 'False' is niet 'false', dus de controle blijft aan staan.
      expect(isCaptchaEnabled()).toBe(true);
    });
  });
});

describe('shouldRequireCaptcha', () => {
  it('vraagt geen captcha als de controle uitstaat', async () => {
    const { shouldRequireCaptcha } = await laadCaptcha({
      CAPTCHA_ENABLED: 'false',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });
    expect(shouldRequireCaptcha('10.0.0.1', 500)).toBe(false);
  });

  it('vraagt geen captcha als er geen sleutel is om mee te controleren', async () => {
    const { shouldRequireCaptcha } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: '',
    });
    expect(shouldRequireCaptcha('10.0.0.1', 500)).toBe(false);
  });

  it('vraagt een captcha bij een bestelling vanaf honderd euro', async () => {
    const { shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    expect(shouldRequireCaptcha('10.0.0.1', 100)).toBe(true);
    expect(logger.debug).toHaveBeenCalledWith('CAPTCHA required: high-value order', {
      ip: '10.0.0.1',
      orderTotal: 100,
    });
  });

  it('vraagt ook bij een kleine bestelling een captcha als basisbescherming', async () => {
    const { shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    // De functie eindigt met `return true`. In de praktijk is captcha dus
    // altijd vereist zodra hij aanstaat; de drempels bepalen alleen nog welke
    // reden er in het log komt. Wie de drempels wil gebruiken om captcha soms
    // over te slaan, moet die laatste regel veranderen.
    expect(shouldRequireCaptcha('10.0.0.1', 1)).toBe(true);
    expect(logger.debug).not.toHaveBeenCalledWith('CAPTCHA required: high-value order', expect.anything());
  });
});

describe('trackCheckoutRequest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merkt een ip aan als verdacht na vijf aanvragen binnen het venster', async () => {
    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 5; i++) trackCheckoutRequest('198.51.100.7');
    shouldRequireCaptcha('198.51.100.7', 10);

    expect(logger.debug).toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', {
      ip: '198.51.100.7',
      requestCount: 5,
    });
  });

  it('vindt vier aanvragen nog niet verdacht', async () => {
    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 4; i++) trackCheckoutRequest('198.51.100.8');
    shouldRequireCaptcha('198.51.100.8', 10);

    expect(logger.debug).not.toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', expect.anything());
  });

  it('vergeet een verdacht ip zodra het venster van vijftien minuten voorbij is', async () => {
    // De klok wordt op nu gezet en daarna vooruit gedraaid; een vaste datum in
    // de toekomst zou over een jaar iets anders betekenen.
    vi.useFakeTimers();
    vi.setSystemTime(new Date());

    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 6; i++) trackCheckoutRequest('198.51.100.9');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    shouldRequireCaptcha('198.51.100.9', 10);

    expect(logger.debug).not.toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', expect.anything());
  });

  it('begint na het venster opnieuw te tellen in plaats van door te tellen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());

    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 4; i++) trackCheckoutRequest('198.51.100.10');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    // Deze aanvraag valt buiten het oude venster en zet de teller op 1. Zonder
    // die herstart zou dit de vijfde zijn en het ip verdacht maken.
    trackCheckoutRequest('198.51.100.10');
    shouldRequireCaptcha('198.51.100.10', 10);

    expect(logger.debug).not.toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', expect.anything());
  });

  it('houdt ip-adressen los van elkaar bij', async () => {
    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 5; i++) trackCheckoutRequest('198.51.100.11');
    trackCheckoutRequest('198.51.100.12');
    shouldRequireCaptcha('198.51.100.12', 10);

    expect(logger.debug).not.toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', expect.anything());
  });

  it('houdt honderd ip-adressen bij zonder om te vallen', async () => {
    // De opruiming boven de honderd is niet van buitenaf waarneembaar - de map
    // is niet geexporteerd. Wat wel te toetsen valt is dat het bijhouden van
    // meer dan honderd adressen de bestaande telling niet stukmaakt.
    const { trackCheckoutRequest, shouldRequireCaptcha, logger } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });

    for (let i = 0; i < 5; i++) trackCheckoutRequest('198.51.100.13');
    for (let i = 0; i < 150; i++) trackCheckoutRequest(`10.1.${Math.floor(i / 256)}.${i % 256}`);
    shouldRequireCaptcha('198.51.100.13', 10);

    expect(logger.debug).toHaveBeenCalledWith('CAPTCHA required: suspicious IP activity', {
      ip: '198.51.100.13',
      requestCount: 5,
    });
  });
});

describe('getCaptchaSiteKey', () => {
  it('geeft de sitesleutel terug voor de frontend', async () => {
    const { getCaptchaSiteKey } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SITE_KEY: SITESLEUTEL,
    });
    expect(getCaptchaSiteKey()).toBe(SITESLEUTEL);
  });

  it('geeft niets terug als de controle uitstaat', async () => {
    const { getCaptchaSiteKey } = await laadCaptcha({
      CAPTCHA_ENABLED: 'false',
      HCAPTCHA_SITE_KEY: SITESLEUTEL,
    });
    expect(getCaptchaSiteKey()).toBeNull();
  });

  it('geeft niets terug als er geen sitesleutel is', async () => {
    const { getCaptchaSiteKey } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SITE_KEY: '',
    });
    expect(getCaptchaSiteKey()).toBeNull();
  });

  it('geeft de sitesleutel terug, niet het geheim', async () => {
    // De sitesleutel is openbaar en hoort in de pagina; de geheime sleutel
    // niet. Deze test bewaakt dat de twee niet ooit verwisseld worden.
    const { getCaptchaSiteKey } = await laadCaptcha({
      CAPTCHA_ENABLED: 'true',
      HCAPTCHA_SITE_KEY: SITESLEUTEL,
      HCAPTCHA_SECRET_KEY: GEHEIM,
    });
    expect(getCaptchaSiteKey()).toBe(SITESLEUTEL);
    expect(getCaptchaSiteKey()).not.toBe(GEHEIM);
  });
});

describe('isCaptchaEnabled', () => {
  it('is alleen waar als de schakelaar aanstaat en er een sleutel is', async () => {
    const aan = await laadCaptcha({ CAPTCHA_ENABLED: 'true', HCAPTCHA_SECRET_KEY: GEHEIM });
    expect(aan.isCaptchaEnabled()).toBe(true);

    const zonderSleutel = await laadCaptcha({ CAPTCHA_ENABLED: 'true', HCAPTCHA_SECRET_KEY: '' });
    expect(zonderSleutel.isCaptchaEnabled()).toBe(false);

    const uit = await laadCaptcha({ CAPTCHA_ENABLED: 'false', HCAPTCHA_SECRET_KEY: GEHEIM });
    expect(uit.isCaptchaEnabled()).toBe(false);
  });
});
