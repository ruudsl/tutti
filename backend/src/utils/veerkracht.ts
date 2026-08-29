/**
 * Veerkracht bij uitgaande diensten: herkansen en een stroomonderbreker.
 *
 * Tutti praat met een handvol diensten waar we niets over te zeggen hebben:
 * Spotify, Apple Music, Spond, Telegram, WhatsApp, IMSLP. Die vallen om, zijn
 * een halve minuut traag, of geven een keer een 503 zonder dat er iets aan de
 * hand is.
 *
 * Daar horen twee verschillende antwoorden bij, en ze doen het tegenovergestelde:
 *
 * - **Herkansen** helpt tegen een hik. Eén verzoek mislukt, het volgende lukt.
 *   Alleen zinvol als de fout tijdelijk is en de aanroep herhaalbaar: een 404
 *   wordt bij de tweede poging ook een 404, en een tweede keer "verstuur dit
 *   bericht" is een tweede bericht.
 * - **Een stroomonderbreker** helpt tegen een dienst die echt plat ligt.
 *   Blijven proberen kost dan bij elke aanroep de volle timeout, houdt onze
 *   eigen werkers bezet en helpt de andere kant niet vooruit. Na een reeks
 *   mislukkingen gaan we een tijdje niet meer bellen en geven we meteen op.
 *
 * Los zijn ze allebei gevaarlijk: herkansen zonder onderbreker vermenigvuldigt
 * het verkeer naar een dienst die al omvalt. Daarom staat de onderbreker hier
 * er altijd omheen: alle pogingen samen tellen als één storing.
 *
 * Wat níet tijdelijk is - 401, 403, 404, een ongeldig verzoek - wordt niet
 * herkanst en telt niet mee voor de onderbreker. Dat zijn gewone antwoorden.
 */

import logger from './logger';

/**
 * Een fout van een externe dienst, met de HTTP-status erbij.
 *
 * Zonder status is de fout niet in te delen: `new Error('mislukt: 503')` is
 * voor code een string. De onderbreker en de herkansing hebben het getal nodig
 * om te weten of doorgaan zin heeft.
 */
export class DienstFout extends Error {
  /** Naam van de dienst, zoals hij in het logboek terugkomt. */
  readonly dienst: string;
  /** HTTP-status, als die er was. */
  readonly status?: number;
  /** Wat de dienst in een Retry-After-kop vroeg, in milliseconden. */
  readonly herkansNaMs?: number;

  constructor(boodschap: string, opties: { dienst: string; status?: number; herkansNaMs?: number; cause?: unknown }) {
    super(boodschap, { cause: opties.cause });
    this.name = 'DienstFout';
    this.dienst = opties.dienst;
    this.status = opties.status;
    this.herkansNaMs = opties.herkansNaMs;
  }
}

/** Netwerkfouten van Node en undici die zeggen: probeer het straks nog eens. */
const TIJDELIJKE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * HTTP-statussen die zeggen: probeer het straks nog eens.
 *
 * 408 en 425 zijn de verzoekende kant, 429 is te druk, 5xx is de andere kant.
 * 501 hoort er niet bij (dat wordt over vijf minuten ook niet geïmplementeerd)
 * en 505 evenmin.
 */
export function statusIsTijdelijk(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status !== 501 && status !== 505;
}

/** De HTTP-status uit een fout halen, ongeacht of hij van fetch of axios komt. */
export function statusVan(fout: unknown): number | undefined {
  if (fout instanceof DienstFout) return fout.status;
  if (typeof fout !== 'object' || fout === null) return undefined;
  const kandidaat = fout as { status?: unknown; response?: { status?: unknown } };
  if (typeof kandidaat.status === 'number') return kandidaat.status;
  if (typeof kandidaat.response?.status === 'number') return kandidaat.response.status;
  return undefined;
}

function codeVan(fout: unknown): string | undefined {
  if (typeof fout !== 'object' || fout === null) return undefined;
  const kandidaat = fout as { code?: unknown; cause?: unknown };
  if (typeof kandidaat.code === 'string') return kandidaat.code;
  // fetch verpakt netwerkfouten in een TypeError met de echte fout in cause.
  if (kandidaat.cause) return codeVan(kandidaat.cause);
  return undefined;
}

/**
 * Is dit een fout waarvan we mogen aannemen dat hij vanzelf overgaat?
 *
 * Alleen deze fouten worden herkanst en tellen mee voor de onderbreker. Een
 * verkeerd wachtwoord of een niet-bestaand nummer is een antwoord, geen storing.
 */
export function isTijdelijk(fout: unknown): boolean {
  const status = statusVan(fout);
  if (status !== undefined) return statusIsTijdelijk(status);

  const code = codeVan(fout);
  if (code && TIJDELIJKE_CODES.has(code)) return true;

  // AbortSignal.timeout() geeft een TimeoutError; een afgebroken verbinding een
  // AbortError. Allebei: de dienst was te traag, niet: het antwoord klopt niet.
  if (fout instanceof Error && (fout.name === 'TimeoutError' || fout.name === 'AbortError')) return true;

  // undici gooit een kale TypeError ('fetch failed') als de verbinding niet
  // opgezet kan worden. Zonder cause is er niets beters om op te sturen.
  if (fout instanceof TypeError && /fetch failed|network|socket/i.test(fout.message)) return true;

  return false;
}

/** Een Retry-After-kop omrekenen naar milliseconden. Seconden of een datum. */
export function herkansNaUitKop(kop: string | null | undefined): number | undefined {
  if (!kop) return undefined;
  const seconden = Number(kop);
  if (Number.isFinite(seconden) && seconden >= 0) return seconden * 1000;
  const tijdstip = Date.parse(kop);
  if (Number.isNaN(tijdstip)) return undefined;
  return Math.max(0, tijdstip - Date.now());
}

const slaapEcht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

export interface HerkansingOpties {
  /** Naam voor het logboek. */
  naam?: string;
  /** Totaal aantal pogingen, de eerste meegeteld. 1 betekent: niet herkansen. */
  pogingen?: number;
  /** Wachttijd na de eerste mislukking; verdubbelt daarna. */
  basisMs?: number;
  /** Plafond voor één wachttijd. */
  maxMs?: number;
  /** Budget voor alle wachttijden samen. Op is op, ook als er pogingen over zijn. */
  maxTotaalMs?: number;
  /** Welke fouten mogen worden herkanst. Standaard: alleen tijdelijke. */
  isHerkansbaar?: (fout: unknown) => boolean;
  /** Alleen voor tests: wachten zonder echt te wachten. */
  slaap?: (ms: number) => Promise<void>;
}

const HERKANSING_STANDAARD = {
  pogingen: 3,
  basisMs: 200,
  maxMs: 2000,
  maxTotaalMs: 5000,
};

/**
 * De wachttijd voor de volgende poging.
 *
 * Exponentieel, met de helft van de tijd als spreiding: bij een storing die
 * honderd aanvragen tegelijk raakt komen ze anders honderd keer tegelijk terug
 * en valt de dienst opnieuw om, precies op het moment dat hij opkrabbelt.
 */
export function wachttijd(poging: number, basisMs: number, maxMs: number, willekeur = Math.random): number {
  const exponentieel = Math.min(maxMs, basisMs * 2 ** (poging - 1));
  const helft = exponentieel / 2;
  return Math.round(helft + willekeur() * helft);
}

/**
 * Voer een taak uit en herkans hem als hij tijdelijk mislukt.
 *
 * **Alleen voor herhaalbare aanroepen.** Een GET mag twee keer; "verstuur dit
 * bericht" niet, want dan staat het er twee keer. Voor die tweede soort is de
 * stroomonderbreker er wel en de herkansing niet.
 *
 * @param taak wordt aangeroepen met het pogingnummer, te beginnen bij 1.
 */
export async function metHerkansing<T>(
  taak: (poging: number) => Promise<T>,
  opties: HerkansingOpties = {},
): Promise<T> {
  const pogingen = opties.pogingen ?? HERKANSING_STANDAARD.pogingen;
  const basisMs = opties.basisMs ?? HERKANSING_STANDAARD.basisMs;
  const maxMs = opties.maxMs ?? HERKANSING_STANDAARD.maxMs;
  const maxTotaalMs = opties.maxTotaalMs ?? HERKANSING_STANDAARD.maxTotaalMs;
  const isHerkansbaar = opties.isHerkansbaar ?? isTijdelijk;
  const slaap = opties.slaap ?? slaapEcht;
  const naam = opties.naam ?? 'onbekend';

  let gewacht = 0;

  for (let poging = 1; ; poging++) {
    try {
      return await taak(poging);
    } catch (fout) {
      if (poging >= pogingen || !isHerkansbaar(fout)) throw fout;

      // Vraagt de dienst zelf om een wachttijd, dan houden we ons daaraan -
      // die weet beter wanneer hij weer wil. Maar niet langer dan ons budget.
      const gevraagd = fout instanceof DienstFout ? fout.herkansNaMs : undefined;
      const wacht = gevraagd !== undefined ? Math.min(gevraagd, maxMs) : wachttijd(poging, basisMs, maxMs);

      if (gewacht + wacht > maxTotaalMs) {
        logger.warn('Herkansing opgegeven: tijdsbudget op', {
          dienst: naam,
          poging,
          gewachtMs: gewacht,
          nodigMs: wacht,
        });
        throw fout;
      }

      gewacht += wacht;
      logger.warn('Uitgaande aanroep mislukt, herkansing volgt', {
        dienst: naam,
        poging,
        van: pogingen,
        wachtMs: wacht,
        status: statusVan(fout),
        fout: fout instanceof Error ? fout.message : String(fout),
      });
      await slaap(wacht);
    }
  }
}

/** De stand van een onderbreker: dicht (normaal), open (overgeslagen), of op proef. */
export type Stroomstand = 'gesloten' | 'open' | 'halfopen';

/** Wordt gegooid als de onderbreker openstaat en de aanroep dus niet is gedaan. */
export class StroomonderbrekerOpenFout extends Error {
  readonly dienst: string;
  /** Over hoeveel milliseconden er weer een poging wordt gewaagd. */
  readonly opnieuwOverMs: number;

  constructor(dienst: string, opnieuwOverMs: number) {
    super(`${dienst} is tijdelijk niet bereikbaar; opnieuw proberen over ${Math.ceil(opnieuwOverMs / 1000)}s.`);
    this.name = 'StroomonderbrekerOpenFout';
    this.dienst = dienst;
    this.opnieuwOverMs = opnieuwOverMs;
  }
}

export interface StroomonderbrekerOpties {
  /** Zoveel opeenvolgende storingen en de onderbreker gaat open. */
  drempel?: number;
  /** Hoe lang de onderbreker open blijft voordat hij een proef toestaat. */
  openMs?: number;
  /** Zoveel geslaagde proeven achter elkaar en hij gaat weer dicht. */
  proeven?: number;
  /** Welke fouten als storing tellen. Standaard: alleen tijdelijke. */
  teltAlsStoring?: (fout: unknown) => boolean;
  /** Alleen voor tests: de klok. */
  nu?: () => number;
}

export interface Stroomstatistiek {
  dienst: string;
  stand: Stroomstand;
  storingen: number;
  geslaagdeProeven: number;
  /** Wanneer de onderbreker voor het laatst openging. */
  openSinds: string | null;
  /** Hoeveel aanroepen er zijn overgeslagen sinds de start. */
  overgeslagen: number;
}

/**
 * Een stroomonderbreker om één externe dienst.
 *
 * Drie standen:
 *
 * - **gesloten** - alles gaat gewoon door. Storingen worden geteld; een
 *   geslaagde aanroep zet die teller op nul, want losse hikjes zijn geen reeks.
 * - **open** - de dienst ligt eruit. Aanroepen worden meteen afgewezen met een
 *   `StroomonderbrekerOpenFout`, zonder de dienst te belasten en zonder dat de
 *   aanvrager op een timeout hoeft te wachten.
 * - **halfopen** - de open-tijd is voorbij en we laten één aanroep door om te
 *   kijken. Lukt hij, dan dicht; mislukt hij, dan weer open. Alle andere
 *   aanroepen worden ondertussen afgewezen, want één proef is genoeg om het te
 *   weten en honderd proeven duwen de dienst meteen weer om.
 */
export class Stroomonderbreker {
  readonly dienst: string;
  private readonly drempel: number;
  private readonly openMs: number;
  private readonly proevenNodig: number;
  private readonly teltAlsStoring: (fout: unknown) => boolean;
  private readonly nu: () => number;

  private toestand: Stroomstand = 'gesloten';
  private storingen = 0;
  private geslaagdeProeven = 0;
  private openTot = 0;
  private openSinds: number | null = null;
  private proefLoopt = false;
  private overgeslagen = 0;

  constructor(dienst: string, opties: StroomonderbrekerOpties = {}) {
    this.dienst = dienst;
    this.drempel = opties.drempel ?? 5;
    this.openMs = opties.openMs ?? 30_000;
    this.proevenNodig = opties.proeven ?? 1;
    this.teltAlsStoring = opties.teltAlsStoring ?? isTijdelijk;
    this.nu = opties.nu ?? Date.now;
  }

  get stand(): Stroomstand {
    // De overgang van open naar halfopen gebeurt op tijd, niet op een gebeurtenis;
    // zonder deze controle blijft de onderbreker open tot iemand toevallig belt.
    if (this.toestand === 'open' && this.nu() >= this.openTot) return 'halfopen';
    return this.toestand;
  }

  get statistiek(): Stroomstatistiek {
    return {
      dienst: this.dienst,
      stand: this.stand,
      storingen: this.storingen,
      geslaagdeProeven: this.geslaagdeProeven,
      openSinds: this.openSinds === null ? null : new Date(this.openSinds).toISOString(),
      overgeslagen: this.overgeslagen,
    };
  }

  /** Alles op nul. Bedoeld voor tests en voor een beheerder die het beter weet. */
  herstel(): void {
    this.toestand = 'gesloten';
    this.storingen = 0;
    this.geslaagdeProeven = 0;
    this.openTot = 0;
    this.openSinds = null;
    this.proefLoopt = false;
  }

  async voer<T>(taak: () => Promise<T>): Promise<T> {
    const stand = this.stand;

    if (stand === 'open') {
      this.overgeslagen++;
      throw new StroomonderbrekerOpenFout(this.dienst, Math.max(0, this.openTot - this.nu()));
    }

    if (stand === 'halfopen') {
      if (this.proefLoopt) {
        this.overgeslagen++;
        throw new StroomonderbrekerOpenFout(this.dienst, Math.max(0, this.openTot - this.nu()));
      }
      this.toestand = 'halfopen';
      this.proefLoopt = true;
    }

    try {
      const resultaat = await taak();
      this.meldGeslaagd();
      return resultaat;
    } catch (fout) {
      this.meldMislukt(fout);
      throw fout;
    } finally {
      this.proefLoopt = false;
    }
  }

  private meldGeslaagd(): void {
    if (this.toestand === 'halfopen') {
      this.geslaagdeProeven++;
      if (this.geslaagdeProeven >= this.proevenNodig) {
        logger.info('Stroomonderbreker weer dicht', { dienst: this.dienst });
        this.herstel();
      }
      return;
    }
    this.storingen = 0;
  }

  private meldMislukt(fout: unknown): void {
    // Een 404 of een verkeerd wachtwoord zegt niets over de gezondheid van de
    // dienst. Die fout gaat gewoon naar de aanvrager en telt hier niet mee.
    if (!this.teltAlsStoring(fout)) return;

    if (this.toestand === 'halfopen') {
      logger.warn('Proef mislukt, stroomonderbreker weer open', { dienst: this.dienst });
      this.gaOpen();
      return;
    }

    this.storingen++;
    if (this.storingen >= this.drempel) {
      logger.error('Stroomonderbreker open: dienst wordt overgeslagen', {
        dienst: this.dienst,
        storingen: this.storingen,
        openMs: this.openMs,
      });
      this.gaOpen();
    }
  }

  private gaOpen(): void {
    this.toestand = 'open';
    this.geslaagdeProeven = 0;
    this.openSinds = this.nu();
    this.openTot = this.nu() + this.openMs;
  }
}

const onderbrekers = new Map<string, Stroomonderbreker>();

/**
 * De onderbreker van een dienst, aangemaakt bij de eerste aanroep.
 *
 * Eén per dienst en gedeeld over de hele applicatie: een onderbreker die per
 * aanroep opnieuw wordt gemaakt telt nooit tot vijf en doet dus niets.
 * Opties tellen alleen bij de eerste aanroep.
 */
export function stroomonderbreker(dienst: string, opties: StroomonderbrekerOpties = {}): Stroomonderbreker {
  let bestaande = onderbrekers.get(dienst);
  if (!bestaande) {
    bestaande = new Stroomonderbreker(dienst, opties);
    onderbrekers.set(dienst, bestaande);
  }
  return bestaande;
}

/** De stand van alle onderbrekers, voor /api/health/detailed. */
export function stroomstanden(): Stroomstatistiek[] {
  return [...onderbrekers.values()].map((o) => o.statistiek);
}

/** Alle onderbrekers op nul. Alleen voor tests. */
export function herstelAlleStroomonderbrekers(): void {
  for (const onderbreker of onderbrekers.values()) onderbreker.herstel();
}

export interface BeschermdOpties extends HerkansingOpties {
  onderbreker?: StroomonderbrekerOpties;
}

/**
 * Een uitgaande aanroep met een onderbreker eromheen en herkansingen erbinnen.
 *
 * In die volgorde, en niet andersom: alle pogingen samen tellen als één storing
 * voor de onderbreker. Zou de onderbreker binnen de herkansing zitten, dan
 * telde één trage aanroep meteen voor drie en ging hij veel te snel open.
 *
 * Voor niet-herhaalbare aanroepen (iets versturen, iets aanmaken) geef je
 * `pogingen: 1`: dan blijft alleen de onderbreker over.
 */
export function beschermd<T>(
  dienst: string,
  taak: (poging: number) => Promise<T>,
  opties: BeschermdOpties = {},
): Promise<T> {
  const onderbreker = stroomonderbreker(dienst, opties.onderbreker);
  return onderbreker.voer(() => metHerkansing(taak, { naam: dienst, ...opties }));
}
