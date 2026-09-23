/**
 * De wachtrij voor achtergrondtaken, in de database.
 *
 * Tot nu toe had elke planner zijn eigen setTimeout-lus in het geheugen. Dat
 * had drie gevolgen (zie WP12 in ROADMAP.md): een herstart gooide lopend werk
 * weg zonder spoor, een tweede instantie deed alles dubbel, en een mislukte
 * taak stond alleen in het logboek. Hier staat elke taak als rij in
 * `achtergrondtaken`, met zijn status, zijn pogingen en zijn laatste fout.
 *
 * Een taak heeft een soort. Wat een soort doet, en of hij opnieuw geprobeerd
 * mag worden, staat in een definitie die bij het opstarten wordt
 * geregistreerd (src/taken/index.ts). In de rij staan alleen de gegevens.
 *
 * ## De sluis
 *
 * Een werker pakt een taak met een UPDATE die alleen slaagt zolang de taak
 * nog vrij is, en telt het aantal gewijzigde rijen: één is van hem, nul is
 * van een ander. Dat werkt ongeacht hoeveel werkers er tegelijk kijken.
 *
 * Met sql.js is er per definitie één proces - de database zit in zijn
 * geheugen - dus de sluis doet nu vooral dienst tegen twee tikken van
 * dezelfde werker die elkaar overlappen. Hij staat er toch zo, omdat het
 * patroon één op één overgaat naar PostgreSQL (zie docs/POSTGRES_MIGRATION.md).
 *
 * ## Herhaalbaar of niet
 *
 * Elke definitie zegt of de taak herhaalbaar is: of hij een tweede keer mag
 * draaien als de eerste halverwege stopte. Een taak die iets verstuurt is dat
 * meestal niet; een tweede poging kan een tweede bericht zijn. Dezelfde
 * afweging als bij uitgaande aanroepen, zie docs/VEERKRACHT.md.
 *
 * - Gooit een herhaalbare taak een fout, dan wacht hij en probeert het
 *   opnieuw, met een oplopende wachttijd, tot `maxPogingen`.
 * - Gooit een niet-herhaalbare taak een fout, dan is hij meteen mislukt.
 * - Wordt een taak onderbroken - het proces viel om terwijl hij liep - dan
 *   verloopt zijn vergrendeling. Een herhaalbare taak wordt daarna opnieuw
 *   opgepakt; een niet-herhaalbare wordt als mislukt gemarkeerd, met die
 *   reden erbij. Of hij af was, weet niemand.
 *
 * `mislukt` is het eindstation: daar blijft een taak staan tot iemand hem
 * bekijkt, en hij verdwijnt pas na een ruime bewaartermijn.
 */

import crypto from 'crypto';
import db from '../database/connection';
import logger from '../utils/logger';

export type TaakStatus = 'wachtend' | 'bezig' | 'gelukt' | 'mislukt';

export interface TaakContext {
  id: string;
  poging: number;
  associationId: string | null;
}

export interface TaakDefinitie<G = Record<string, unknown>> {
  uitvoeren: (gegevens: G, context: TaakContext) => Promise<void> | void;
  /** Mag deze taak nog eens draaien als een eerdere poging halverwege stopte? */
  herhaalbaar: boolean;
  /** Alleen voor herhaalbare taken. Standaard 5. */
  maxPogingen?: number;
  /**
   * Hoe lang een poging mag duren voordat de vergrendeling verloopt en een
   * andere werker hem als onderbroken beschouwt. Ruim kiezen: te kort, en een
   * trage maar gezonde taak draait twee keer. Standaard tien minuten.
   */
  looptijdMs?: number;
}

export interface Periodiek {
  /**
   * De sleutel van het tijdvak waarin `nu` valt, of null als deze taak nu
   * niet aan de beurt is. Eén taak per sleutel: zo draait een periodieke taak
   * één keer per tijdvak, ook als er intussen herstart wordt.
   */
  sleutelVoor: (nu: Date) => string | null;
}

interface TaakRij {
  id: string;
  soort: string;
  gegevens: string;
  status: TaakStatus;
  pogingen: number;
  vergrendeld_tot: string | null;
  association_id: string | null;
}

const STANDAARD_MAX_POGINGEN = 5;
const STANDAARD_LOOPTIJD_MS = 10 * 60 * 1000;
/** Eerste wachttijd na een mislukte poging; daarna telkens het dubbele. */
const BASIS_WACHTTIJD_MS = 30 * 1000;
const MAX_WACHTTIJD_MS = 60 * 60 * 1000;
/** Hoe vaak de werker kijkt of er iets klaarstaat. */
const TIK_MS = 15 * 1000;
/** Gelukte taken zijn na twee weken niet interessant meer; mislukte wel langer. */
const BEWAAR_GELUKT_MS = 14 * 24 * 60 * 60 * 1000;
const BEWAAR_MISLUKT_MS = 90 * 24 * 60 * 60 * 1000;

const definities = new Map<string, TaakDefinitie<any>>();
const periodieke = new Map<string, Periodiek>();

/** Wie deze werker is, zodat in de rij te zien is welk proces een taak heeft. */
const EIGENAAR = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

export function registreerTaak<G = Record<string, unknown>>(soort: string, definitie: TaakDefinitie<G>): void {
  definities.set(soort, definitie);
}

/** Plan deze soort periodiek in. De soort moet ook met registreerTaak bestaan. */
export function registreerPeriodiek(soort: string, periodiek: Periodiek): void {
  periodieke.set(soort, periodiek);
}

/** Alleen voor tests: begin met een lege lijst definities. */
export function wisRegistratiesVoorTests(): void {
  definities.clear();
  periodieke.clear();
}

export interface PlaatsOpties {
  /** Eén taak per sleutel; een tweede met dezelfde sleutel wordt genegeerd. */
  sleutel?: string;
  geplandOp?: Date;
  associationId?: string | null;
  nu?: Date;
}

/**
 * Zet een taak in de wachtrij.
 *
 * @returns het id van de nieuwe taak, of null als er al een taak met deze
 *   sleutel was.
 */
export function plaatsTaak(soort: string, gegevens: object = {}, opties: PlaatsOpties = {}): string | null {
  const nu = (opties.nu ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const resultaat = db
    .prepare(
      `INSERT OR IGNORE INTO achtergrondtaken
         (id, soort, sleutel, gegevens, status, pogingen, gepland_op, association_id, aangemaakt_op, bijgewerkt_op)
       VALUES (?, ?, ?, ?, 'wachtend', 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      soort,
      opties.sleutel ?? null,
      JSON.stringify(gegevens),
      (opties.geplandOp ?? opties.nu ?? new Date()).toISOString(),
      opties.associationId ?? null,
      nu,
      nu,
    );
  return resultaat.changes === 1 ? id : null;
}

/** Wachttijd voor de volgende poging: 30 s, 1 min, 2 min, ... tot een uur. */
export function wachttijdNa(poging: number): number {
  return Math.min(BASIS_WACHTTIJD_MS * 2 ** Math.max(0, poging - 1), MAX_WACHTTIJD_MS);
}

function foutTekst(fout: unknown): string {
  const tekst = fout instanceof Error ? fout.message : String(fout);
  return tekst.slice(0, 1000);
}

/**
 * Zet een taak op mislukt. Met `voorwaarde` alleen als de rij nog in de
 * verwachte toestand is: een vaste stuk SQL met eigen parameters, nooit
 * ingeplakte waarden.
 */
function markeerMislukt(
  id: string,
  reden: string,
  nu: string,
  voorwaarde: { sql: string; waarden: unknown[] } = { sql: '', waarden: [] },
): boolean {
  return (
    db
      .prepare(
        `UPDATE achtergrondtaken
            SET status = 'mislukt', laatste_fout = ?, eigenaar = NULL, vergrendeld_tot = NULL,
                afgerond_op = ?, bijgewerkt_op = ?
          WHERE id = ? ${voorwaarde.sql}`,
      )
      .run(reden, nu, nu, id, ...voorwaarde.waarden).changes === 1
  );
}

const NOG_ONDERBROKEN = `AND status = 'bezig' AND vergrendeld_tot < ?`;
const NOG_VAN_ONS = 'AND eigenaar = ?';

/** Zet de periodieke taken klaar waarvan het tijdvak is aangebroken. */
function planPeriodieke(nu: Date): void {
  for (const [soort, periodiek] of periodieke) {
    let sleutel: string | null;
    try {
      sleutel = periodiek.sleutelVoor(nu);
    } catch (fout) {
      logger.error('Periodieke taak kon zijn tijdvak niet bepalen', { soort, fout: foutTekst(fout) });
      continue;
    }
    if (sleutel) plaatsTaak(soort, {}, { sleutel, nu });
  }
}

/**
 * Probeer één taak te pakken die aan de beurt is.
 *
 * Aan de beurt is: wachtend met een planmoment dat voorbij is, of bezig met
 * een vergrendeling die verlopen is (onderbroken). Een onderbroken taak die
 * niet herhaalbaar is, wordt hier als mislukt gemarkeerd in plaats van
 * opgepakt, en er wordt naar de volgende gekeken.
 */
function pakTaak(nu: Date): { rij: TaakRij; definitie: TaakDefinitie<any> } | null {
  const nuTekst = nu.toISOString();

  // Een paar rondes: een kandidaat die net door een ander is gepakt of die
  // als onderbroken wordt afgeboekt, is geen reden om deze tik te stoppen.
  for (let ronde = 0; ronde < 20; ronde++) {
    const kandidaat = db
      .prepare(
        `SELECT id, soort, gegevens, status, pogingen, vergrendeld_tot, association_id
           FROM achtergrondtaken
          WHERE (status = 'wachtend' AND gepland_op <= ?)
             OR (status = 'bezig' AND vergrendeld_tot < ?)
          ORDER BY gepland_op
          LIMIT 1`,
      )
      .get(nuTekst, nuTekst) as TaakRij | undefined;
    if (!kandidaat) return null;

    const definitie = definities.get(kandidaat.soort);
    if (!definitie) {
      markeerMislukt(kandidaat.id, `Onbekende soort taak: ${kandidaat.soort}`, nuTekst);
      continue;
    }

    const onderbroken = kandidaat.status === 'bezig';
    const max = definitie.herhaalbaar ? (definitie.maxPogingen ?? STANDAARD_MAX_POGINGEN) : 1;
    if (onderbroken && (!definitie.herhaalbaar || kandidaat.pogingen >= max)) {
      const reden = definitie.herhaalbaar
        ? `Onderbroken tijdens poging ${kandidaat.pogingen} van ${max}; geen pogingen meer over.`
        : 'Onderbroken terwijl hij liep. Deze taak is niet herhaalbaar, dus niet opnieuw geprobeerd: ' +
          'of hij af was, is niet bekend.';
      markeerMislukt(kandidaat.id, reden, nuTekst, { sql: NOG_ONDERBROKEN, waarden: [nuTekst] });
      continue;
    }

    // De sluis: alleen van ons als deze UPDATE precies één rij raakt.
    const tot = new Date(nu.getTime() + (definitie.looptijdMs ?? STANDAARD_LOOPTIJD_MS)).toISOString();
    const gepakt = db
      .prepare(
        `UPDATE achtergrondtaken
            SET status = 'bezig', eigenaar = ?, vergrendeld_tot = ?, pogingen = pogingen + 1, bijgewerkt_op = ?
          WHERE id = ?
            AND ((status = 'wachtend' AND gepland_op <= ?) OR (status = 'bezig' AND vergrendeld_tot < ?))`,
      )
      .run(EIGENAAR, tot, nuTekst, kandidaat.id, nuTekst, nuTekst);
    if (gepakt.changes !== 1) continue;

    return { rij: { ...kandidaat, pogingen: kandidaat.pogingen + 1 }, definitie };
  }
  return null;
}

async function voerUit(rij: TaakRij, definitie: TaakDefinitie<any>, nu: () => Date): Promise<void> {
  const context: TaakContext = { id: rij.id, poging: rij.pogingen, associationId: rij.association_id };
  let gegevens: unknown;
  try {
    gegevens = JSON.parse(rij.gegevens);
  } catch {
    markeerMislukt(rij.id, 'De gegevens van deze taak zijn geen geldige JSON.', nu().toISOString());
    return;
  }

  try {
    await definitie.uitvoeren(gegevens, context);
    const klaar = nu().toISOString();
    db.prepare(
      `UPDATE achtergrondtaken
          SET status = 'gelukt', laatste_fout = NULL, eigenaar = NULL, vergrendeld_tot = NULL,
              afgerond_op = ?, bijgewerkt_op = ?
        WHERE id = ? AND eigenaar = ?`,
    ).run(klaar, klaar, rij.id, EIGENAAR);
  } catch (fout) {
    const moment = nu();
    const max = definitie.herhaalbaar ? (definitie.maxPogingen ?? STANDAARD_MAX_POGINGEN) : 1;
    const tekst = foutTekst(fout);

    if (rij.pogingen < max) {
      const volgende = new Date(moment.getTime() + wachttijdNa(rij.pogingen)).toISOString();
      db.prepare(
        `UPDATE achtergrondtaken
            SET status = 'wachtend', laatste_fout = ?, eigenaar = NULL, vergrendeld_tot = NULL,
                gepland_op = ?, bijgewerkt_op = ?
          WHERE id = ? AND eigenaar = ?`,
      ).run(tekst, volgende, moment.toISOString(), rij.id, EIGENAAR);
      logger.warn('Achtergrondtaak mislukt, volgt nog een poging', {
        soort: rij.soort,
        id: rij.id,
        poging: rij.pogingen,
        max,
        fout: tekst,
      });
    } else {
      markeerMislukt(rij.id, tekst, moment.toISOString(), { sql: NOG_VAN_ONS, waarden: [EIGENAAR] });
      logger.error('Achtergrondtaak definitief mislukt', {
        soort: rij.soort,
        id: rij.id,
        pogingen: rij.pogingen,
        fout: tekst,
      });
    }
  }
}

/**
 * Zet een mislukte taak terug in de wachtrij, voor het beheerscherm.
 *
 * Alleen een taak in het eindstation: een wachtende of lopende taak opnieuw
 * inplannen zou hem twee keer laten draaien. De teller begint opnieuw, zodat
 * een herhaalbare taak weer al zijn pogingen heeft. De laatste fout blijft
 * staan tot de volgende poging, zodat zichtbaar blijft waarom hij vastliep.
 *
 * @returns false als de taak niet bestaat of niet mislukt is.
 */
export function probeerOpnieuw(id: string, nu: Date = new Date()): boolean {
  const tekst = nu.toISOString();
  return (
    db
      .prepare(
        `UPDATE achtergrondtaken
            SET status = 'wachtend', pogingen = 0, gepland_op = ?, eigenaar = NULL, vergrendeld_tot = NULL,
                afgerond_op = NULL, bijgewerkt_op = ?
          WHERE id = ? AND status = 'mislukt'`,
      )
      .run(tekst, tekst, id).changes === 1
  );
}

/** Ruim afgeronde taken op die hun bewaartermijn voorbij zijn. */
export function ruimOp(nu: Date = new Date()): number {
  const gelukt = new Date(nu.getTime() - BEWAAR_GELUKT_MS).toISOString();
  const mislukt = new Date(nu.getTime() - BEWAAR_MISLUKT_MS).toISOString();
  return db
    .prepare(
      `DELETE FROM achtergrondtaken
        WHERE (status = 'gelukt' AND afgerond_op < ?)
           OR (status = 'mislukt' AND afgerond_op < ?)`,
    )
    .run(gelukt, mislukt).changes;
}

export interface VerwerkOpties {
  /** Het moment om mee te rekenen; in tests vast, anders de klok. */
  nu?: () => Date;
  /** Hoeveel taken hooguit in één tik. */
  max?: number;
}

/**
 * Eén tik van de werker: periodieke taken klaarzetten, dan de taken die aan
 * de beurt zijn één voor één uitvoeren.
 *
 * Eén voor één, en niet tegelijk: de taken die er nu zijn schrijven allemaal
 * naar dezelfde database in hetzelfde proces, en tegelijk draaien levert daar
 * niets op behalve kans op elkaar kruisende schrijfacties.
 *
 * @returns het aantal uitgevoerde taken.
 */
export async function verwerkWachtrij(opties: VerwerkOpties = {}): Promise<number> {
  const nu = opties.nu ?? (() => new Date());
  const max = opties.max ?? 20;

  planPeriodieke(nu());

  let gedaan = 0;
  while (gedaan < max) {
    const gepakt = pakTaak(nu());
    if (!gepakt) break;
    await voerUit(gepakt.rij, gepakt.definitie, nu);
    gedaan++;
  }
  return gedaan;
}

let timer: NodeJS.Timeout | null = null;
let actief = false;
let bezig = false;
let laatsteOpruiming = 0;

async function tik(): Promise<void> {
  if (!actief) return;
  // Een tik die nog loopt wordt niet ingehaald door de volgende.
  if (!bezig) {
    bezig = true;
    try {
      await verwerkWachtrij();
      if (Date.now() - laatsteOpruiming > 24 * 60 * 60 * 1000) {
        const weg = ruimOp();
        laatsteOpruiming = Date.now();
        if (weg > 0) logger.info(`Achtergrondtaken opgeruimd: ${weg}`);
      }
    } catch (fout) {
      logger.error('Fout in de werker voor achtergrondtaken', { fout: foutTekst(fout) });
    } finally {
      bezig = false;
    }
  }
  if (actief) {
    timer = setTimeout(tik, TIK_MS);
    timer.unref?.();
  }
}

export function startWerker(eersteTikNaMs = 5000): void {
  if (actief) return;
  actief = true;
  logger.info('Werker voor achtergrondtaken gestart', {
    eigenaar: EIGENAAR,
    soorten: [...definities.keys()],
    periodiek: [...periodieke.keys()],
  });
  timer = setTimeout(tik, eersteTikNaMs);
  timer.unref?.();
}

export function stopWerker(): void {
  actief = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
