/**
 * Leden en de muziekbibliotheek inlezen uit een spreadsheet (WP11).
 *
 * Een vereniging die overstapt heeft haar leden en haar bibliotheek meestal in
 * Excel. Dit bestand beoordeelt zo'n bestand regel voor regel en voert daarna
 * uit wat klopt. De route roept eerst `beoordeel...` aan voor het voorbeeld dat
 * de beheerder te zien krijgt, en bij het importeren opnieuw: wat de browser
 * als voorbeeld terugkreeg wordt nooit vertrouwd.
 *
 * Per regel is de uitkomst:
 * - `nieuw`: wordt geïmporteerd;
 * - `bestaat`: staat er al, wordt overgeslagen;
 * - `fout`: kan niet, met de reden erbij.
 * Een waarschuwing (een onbekend instrument, een duur die niet te lezen is)
 * houdt een regel niet tegen; dat ene gegeven valt dan weg.
 *
 * Kolomnamen worden herkend in het Nederlands, Engels en Duits, zonder op
 * hoofdletters, spaties of streepjes te letten. De muziekbibliotheek leest
 * ook de kolommen van de eigen repertoire-export (`/interop/.../repertoire.csv`).
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../database/connection';
import { withTransaction } from '../utils/database';
import { ApiError } from '../middleware/errorHandler';
import { leesCsv } from '../utils/csvLezen';
import { ruimteVoorLeden } from './abonnementLimieten';

/** Meer regels per keer maakt het voorbeeld onleesbaar en de import traag. */
export const MAX_REGELS = 2000;

export type RegelStatus = 'nieuw' | 'bestaat' | 'fout';

export interface Beoordeling<T> {
  /** De rij in de spreadsheet: de kopregel is rij 1. */
  rij: number;
  status: RegelStatus;
  gegevens: T;
  fouten: string[];
  waarschuwingen: string[];
}

export interface Voorbeeld<T> {
  /** Per veld de kolomnaam uit het bestand waarin het gevonden is. */
  kolommen: Record<string, string>;
  /** Kolommen uit het bestand die bij geen veld horen; die worden niet gelezen. */
  genegeerd: string[];
  regels: Beoordeling<T>[];
  tellingen: Record<RegelStatus, number>;
}

// ---------------------------------------------------------------------------
// Kolommen herkennen
// ---------------------------------------------------------------------------

/** Een kolomnaam zonder hoofdletters, accenten, spaties, streepjes en haakjes-inhoud. */
function normaliseer(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

interface Veld {
  namen: string[];
  verplicht?: boolean;
}

function herkenKolommen(kopregel: string[], velden: Record<string, Veld>) {
  const index: Record<string, number> = {};
  const kolommen: Record<string, string> = {};
  const genegeerd: string[] = [];

  kopregel.forEach((kop, i) => {
    const genormaliseerd = normaliseer(kop);
    const veld = Object.entries(velden).find(
      ([sleutel, { namen }]) => !(sleutel in index) && namen.some((naam) => normaliseer(naam) === genormaliseerd),
    );
    if (veld) {
      index[veld[0]] = i;
      kolommen[veld[0]] = kop;
    } else if (kop !== '') {
      genegeerd.push(kop);
    }
  });

  const ontbrekend = Object.entries(velden)
    .filter(([sleutel, { verplicht }]) => verplicht && !(sleutel in index))
    .map(([sleutel, { namen }]) => `${sleutel} (${namen.slice(0, 3).join(', ')})`);
  if (ontbrekend.length > 0) {
    throw new ApiError(400, `Deze kolommen ontbreken in het bestand: ${ontbrekend.join('; ')}.`);
  }

  return { index, kolommen, genegeerd };
}

function lees(csv: string) {
  const { kopregel, rijen } = leesCsv(csv);
  if (kopregel.length === 0) {
    throw new ApiError(400, 'Het bestand is leeg.');
  }
  if (rijen.length === 0) {
    throw new ApiError(400, 'Het bestand heeft alleen een kopregel en geen gegevens.');
  }
  if (rijen.length > MAX_REGELS) {
    throw new ApiError(400, `Het bestand heeft ${rijen.length} regels; per keer kunnen er ${MAX_REGELS}.`);
  }
  return { kopregel, rijen };
}

/** Een cel die meerdere waarden kan bevatten: "Trompet, Bugel" of "Trompet / Bugel". */
function lijst(waarde: string): string[] {
  return waarde
    .split(/[,;/|]/)
    .map((deel) => deel.trim())
    .filter((deel) => deel !== '');
}

function tel<T>(regels: Beoordeling<T>[]): Record<RegelStatus, number> {
  const tellingen: Record<RegelStatus, number> = { nieuw: 0, bestaat: 0, fout: 0 };
  for (const regel of regels) tellingen[regel.status]++;
  return tellingen;
}

/** Een `IN (...)` in stukken: sql.js staat niet onbeperkt veel parameters toe. */
function inStukken<T>(waarden: string[], vraag: (stuk: string[]) => T[]): T[] {
  const uitkomst: T[] = [];
  for (let i = 0; i < waarden.length; i += 500) uitkomst.push(...vraag(waarden.slice(i, i + 500)));
  return uitkomst;
}

// ---------------------------------------------------------------------------
// Leden
// ---------------------------------------------------------------------------

const LEDENVELDEN: Record<string, Veld> = {
  voornaam: { verplicht: true, namen: ['Voornaam', 'Roepnaam', 'First name', 'Firstname', 'Given name', 'Vorname'] },
  tussenvoegsel: { namen: ['Tussenvoegsel', 'Tussenvoegsels', 'Voorvoegsel', 'Prefix', 'Namenszusatz'] },
  achternaam: {
    verplicht: true,
    namen: ['Achternaam', 'Familienaam', 'Last name', 'Lastname', 'Surname', 'Family name', 'Nachname'],
  },
  email: { verplicht: true, namen: ['E-mail', 'Email', 'E-mailadres', 'Emailadres', 'Mail', 'E-Mail-Adresse'] },
  rol: { namen: ['Rol', 'Role', 'Rolle'] },
  instrumenten: { namen: ['Instrument', 'Instrumenten', 'Instruments', 'Instrumente'] },
  orkesten: { namen: ['Orkest', 'Orkesten', 'Orchestra', 'Orchestras', 'Orchester', 'Ensemble'] },
  priveEmail: { namen: ['Privé-e-mail', 'Prive e-mail', 'Persoonlijke e-mail', 'Private email', 'Private E-Mail'] },
};

type Rol = 'admin' | 'music_committee' | 'equipment_committee' | 'uniforms_committee' | 'conductor' | 'member';

/**
 * Rollen zoals een vereniging ze in een spreadsheet zet: de technische naam en
 * de namen uit het scherm (roles.* in de vertalingen), in drie talen.
 */
const ROLNAMEN: Record<string, Rol> = Object.fromEntries(
  (
    [
      ['member', ['member', 'lid', 'leden', 'mitglied', 'muzikant', 'musician', 'musiker']],
      ['conductor', ['conductor', 'dirigent', 'dirigentin']],
      ['admin', ['admin', 'beheerder', 'administrator', 'verwalter']],
      ['music_committee', ['music_committee', 'muziekcommissie', 'music committee', 'musikkommission', 'notenwart']],
      [
        'equipment_committee',
        [
          'equipment_committee',
          'instrumentencommissie',
          'materiaalcommissie',
          'equipment committee',
          'materialausschuss',
        ],
      ],
      [
        'uniforms_committee',
        ['uniforms_committee', 'uniformencommissie', 'uniformcommissie', 'uniforms committee', 'uniformausschuss'],
      ],
    ] as [Rol, string[]][]
  ).flatMap(([rol, namen]) => namen.map((naam) => [normaliseer(naam), rol])),
);

export interface LidGegevens {
  voornaam: string;
  achternaam: string;
  email: string;
  rol: Rol;
  instrumenten: string[];
  orkesten: string[];
  priveEmail: string | null;
}

interface LidIntern extends LidGegevens {
  instrumentIds: string[];
  orkestIds: string[];
}

const emailSchema = z.string().email().max(255);

/** Instrumenten en hun andere namen, in kleine letters, naar het id. */
function laadInstrumenten(): Map<string, string> {
  const kaart = new Map<string, string>();
  // Eerst de andere namen, dan de echte: een echte naam wint van een alias.
  for (const { naam, id } of db
    .prepare('SELECT LOWER(alias) AS naam, instrument_id AS id FROM instrument_aliases')
    .all() as { naam: string; id: string }[]) {
    kaart.set(naam, id);
  }
  for (const { naam, id } of db.prepare('SELECT LOWER(name) AS naam, id FROM instruments').all() as {
    naam: string;
    id: string;
  }[]) {
    kaart.set(naam, id);
  }
  return kaart;
}

function beoordeelLedenIntern(associationId: string, csv: string) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, LEDENVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const instrumenten = laadInstrumenten();
  const orkesten = new Map(
    (
      db.prepare('SELECT id, LOWER(name) AS naam FROM orchestras WHERE association_id = ?').all(associationId) as {
        id: string;
        naam: string;
      }[]
    ).map(({ id, naam }) => [naam, id]),
  );

  // Wie er al is: leden van deze vereniging, rechtstreeks of via
  // user_associations.
  const eigen = new Set(
    (
      db
        .prepare(
          `SELECT LOWER(u.email) AS email FROM users u
           WHERE u.association_id = ? AND u.deleted_at IS NULL
           UNION
           SELECT LOWER(u.email) FROM users u
           JOIN user_associations ua ON ua.user_id = u.id
           WHERE ua.association_id = ? AND u.deleted_at IS NULL`,
        )
        .all(associationId, associationId) as { email: string }[]
    ).map(({ email }) => email),
  );

  // Een e-mailadres is uniek over de hele installatie. Welke adressen uit het
  // bestand al bij een ander account horen, in één keer opgevraagd.
  const adressen = [...new Set(rijen.map((rij) => cel(rij, 'email').toLowerCase()).filter((a) => a !== ''))];
  const inGebruik = new Set(
    inStukken(adressen, (stuk) =>
      (
        db
          .prepare(`SELECT LOWER(email) AS email FROM users WHERE LOWER(email) IN (${stuk.map(() => '?').join(',')})`)
          .all(...stuk) as { email: string }[]
      ).map(({ email }) => email),
    ),
  );

  const gezien = new Set<string>();
  const regels: Beoordeling<LidIntern>[] = rijen.map((rij, i) => {
    const fouten: string[] = [];
    const waarschuwingen: string[] = [];

    const voornaam = cel(rij, 'voornaam');
    const achternaam = [cel(rij, 'tussenvoegsel'), cel(rij, 'achternaam')].filter(Boolean).join(' ');
    const email = cel(rij, 'email').toLowerCase();
    const priveEmail = cel(rij, 'priveEmail').toLowerCase() || null;

    if (!voornaam) fouten.push('Voornaam ontbreekt.');
    if (!cel(rij, 'achternaam')) fouten.push('Achternaam ontbreekt.');
    if (voornaam.length > 100 || achternaam.length > 100) fouten.push('Naam is langer dan 100 tekens.');
    if (!email) fouten.push('E-mailadres ontbreekt.');
    else if (!emailSchema.safeParse(email).success) fouten.push(`"${email}" is geen geldig e-mailadres.`);
    if (priveEmail && !emailSchema.safeParse(priveEmail).success) {
      waarschuwingen.push(`Privé-e-mail "${priveEmail}" is geen geldig adres en wordt niet overgenomen.`);
    }

    const rolTekst = cel(rij, 'rol');
    const rol: Rol = rolTekst ? ROLNAMEN[normaliseer(rolTekst)] : 'member';
    if (!rol) fouten.push(`Onbekende rol "${rolTekst}".`);

    const instrumentNamen = lijst(cel(rij, 'instrumenten'));
    const instrumentIds: string[] = [];
    for (const naam of instrumentNamen) {
      const id = instrumenten.get(naam.toLowerCase());
      if (id) instrumentIds.push(id);
      else waarschuwingen.push(`Instrument "${naam}" is niet gevonden en wordt overgeslagen.`);
    }

    const orkestNamen = lijst(cel(rij, 'orkesten'));
    const orkestIds: string[] = [];
    for (const naam of orkestNamen) {
      const id = orkesten.get(naam.toLowerCase());
      if (id) orkestIds.push(id);
      else waarschuwingen.push(`Orkest "${naam}" bestaat niet in deze vereniging en wordt overgeslagen.`);
    }

    let status: RegelStatus = 'nieuw';
    if (email && gezien.has(email)) {
      fouten.push('Dit e-mailadres staat eerder in het bestand.');
    } else if (email && eigen.has(email)) {
      status = 'bestaat';
    } else if (email && inGebruik.has(email)) {
      fouten.push('Dit e-mailadres is al in gebruik bij een ander account.');
    }
    if (email) gezien.add(email);
    if (fouten.length > 0) status = 'fout';

    return {
      rij: i + 2,
      status,
      gegevens: {
        voornaam,
        achternaam,
        email,
        rol: rol ?? 'member',
        instrumenten: instrumentNamen,
        orkesten: orkestNamen,
        priveEmail: priveEmail && emailSchema.safeParse(priveEmail).success ? priveEmail : null,
        instrumentIds: [...new Set(instrumentIds)],
        orkestIds: [...new Set(orkestIds)],
      },
      fouten,
      waarschuwingen,
    };
  });

  // De grens van het abonnement: wat erboven valt is een fout, van onderen af.
  const ruimte = ruimteVoorLeden(associationId);
  if (ruimte !== null) {
    let over = ruimte;
    for (const regel of regels) {
      if (regel.status !== 'nieuw') continue;
      if (over > 0) {
        over--;
      } else {
        regel.status = 'fout';
        regel.fouten.push('Boven de ledengrens van het abonnement.');
      }
    }
  }

  return { kolommen, genegeerd, regels };
}

/** Zonder de interne id's: die gaan niet naar de browser. */
function zonderIds({ instrumentIds: _i, orkestIds: _o, ...rest }: LidIntern): LidGegevens {
  return rest;
}

export function beoordeelLeden(associationId: string, csv: string): Voorbeeld<LidGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelLedenIntern(associationId, csv);
  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderIds(regel.gegevens) })),
    tellingen: tel(regels),
  };
}

export interface ImportUitkomst<T> extends Voorbeeld<T> {
  geimporteerd: number;
}

/**
 * Importeer de regels die `nieuw` zijn.
 *
 * Een geïmporteerd lid krijgt geen wachtwoord dat iemand kent en geen mail: het
 * stelt een wachtwoord in via "Wachtwoord vergeten", of de beheerder stuurt de
 * uitnodigingen wanneer de vereniging er klaar voor is. Een import van tachtig
 * leden hoort niet ongevraagd tachtig mails te versturen.
 */
export async function importeerLeden(associationId: string, csv: string): Promise<ImportUitkomst<LidGegevens>> {
  const { kolommen, genegeerd, regels } = beoordeelLedenIntern(associationId, csv);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');

  if (nieuw.length > 0) {
    // Eén hash voor de hele import, van een geheim dat direct weer vergeten
    // wordt: niemand kan ermee inloggen. Per lid een eigen bcrypt-hash zou bij
    // honderden leden tientallen seconden rekenen, voor een wachtwoord dat
    // toch niemand kent.
    const onbruikbaar = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    withTransaction(() => {
      const lid = db.prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, association_id, private_email)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      );
      const instrument = db.prepare('INSERT OR IGNORE INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
      const orkest = db.prepare('INSERT OR IGNORE INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');

      for (const { gegevens } of nieuw) {
        const id = uuidv4();
        lid.run(
          id,
          gegevens.email,
          onbruikbaar,
          gegevens.voornaam,
          gegevens.achternaam,
          gegevens.rol,
          associationId,
          gegevens.priveEmail,
        );
        for (const instrumentId of gegevens.instrumentIds) instrument.run(id, instrumentId);
        for (const orkestId of gegevens.orkestIds) orkest.run(id, orkestId);
      }
    });
  }

  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderIds(regel.gegevens) })),
    tellingen: tel(regels),
    geimporteerd: nieuw.length,
  };
}

// ---------------------------------------------------------------------------
// Muziekbibliotheek
// ---------------------------------------------------------------------------

const TITELVELDEN: Record<string, Veld> = {
  titel: { verplicht: true, namen: ['Titel', 'Title', 'Werk', 'Stuk', 'Naam', 'Name'] },
  componist: { namen: ['Componist', 'Composer', 'Komponist'] },
  arrangeur: { namen: ['Arrangeur', 'Arranger', 'Arr', 'Bearbeiter', 'Bearbeitung'] },
  duur: { namen: ['Duur', 'Duration', 'Dauer', 'Speelduur', 'Tijd'] },
  graad: { namen: ['Graad', 'Grade', 'Niveau', 'Moeilijkheid', 'Moeilijkheidsgraad', 'Schwierigkeitsgrad'] },
  genre: { namen: ['Genre', 'Genres', 'Stijl', 'Style', 'Gattung'] },
};

export interface TitelGegevens {
  titel: string;
  componist: string | null;
  arrangeur: string | null;
  duurSeconden: number | null;
  graad: string | null;
  genres: string[];
}

interface TitelIntern extends TitelGegevens {
  genreIds: string[];
}

/**
 * Een speelduur in seconden. Leest "5:30", "1:05:30", "330" (seconden, zoals
 * onze export), "5 min" en "5,5 min". Wat niet te lezen is, geeft `undefined`.
 */
export function leesDuur(waarde: string): number | undefined {
  const tekst = waarde.trim().toLowerCase();
  if (tekst === '') return undefined;
  const klok = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(tekst);
  if (klok) {
    const [, uren = '0', minuten, seconden] = klok;
    return Number(uren) * 3600 + Number(minuten) * 60 + Number(seconden);
  }
  const minutenTekst = /^(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minuten|minuut|minutes|minuten)$/.exec(tekst);
  if (minutenTekst) return Math.round(Number(minutenTekst[1].replace(',', '.')) * 60);
  if (/^\d+$/.test(tekst)) return Number(tekst);
  return undefined;
}

function beoordeelTitelsIntern(associationId: string, csv: string) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, TITELVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const sleutel = (titel: string, arrangeur: string | null) =>
    `${titel.toLowerCase()}\u0000${(arrangeur ?? '').toLowerCase()}`;

  // Een titel is dezelfde als titel en arrangeur gelijk zijn, net als bij het
  // aanmaken van een titel in het scherm.
  const bestaand = new Set(
    (
      db
        .prepare('SELECT title, arranger FROM music_titles WHERE association_id = ? AND deleted_at IS NULL')
        .all(associationId) as { title: string; arranger: string | null }[]
    ).map(({ title, arranger }) => sleutel(title, arranger)),
  );
  const genres = new Map(
    (db.prepare('SELECT id, LOWER(name) AS naam FROM genres').all() as { id: string; naam: string }[]).map(
      ({ id, naam }) => [naam, id],
    ),
  );

  const gezien = new Set<string>();
  const regels: Beoordeling<TitelIntern>[] = rijen.map((rij, i) => {
    const fouten: string[] = [];
    const waarschuwingen: string[] = [];

    const titel = cel(rij, 'titel');
    const componist = cel(rij, 'componist') || null;
    const arrangeur = cel(rij, 'arrangeur') || null;
    const graad = cel(rij, 'graad') || null;

    if (!titel) fouten.push('Titel ontbreekt.');
    if (titel.length > 255) fouten.push('Titel is langer dan 255 tekens.');
    if ((componist?.length ?? 0) > 255 || (arrangeur?.length ?? 0) > 255) {
      fouten.push('Componist of arrangeur is langer dan 255 tekens.');
    }

    const duurTekst = cel(rij, 'duur');
    const duur = leesDuur(duurTekst);
    if (duurTekst && duur === undefined) {
      waarschuwingen.push(`Duur "${duurTekst}" is niet te lezen en wordt overgeslagen.`);
    }

    if (graad && graad.length > 20) {
      waarschuwingen.push(`Graad "${graad}" is langer dan 20 tekens en wordt overgeslagen.`);
    }

    const genreNamen = lijst(cel(rij, 'genre'));
    const genreIds: string[] = [];
    for (const naam of genreNamen) {
      const id = genres.get(naam.toLowerCase());
      if (id) genreIds.push(id);
      else waarschuwingen.push(`Genre "${naam}" is niet gevonden en wordt overgeslagen.`);
    }

    let status: RegelStatus = 'nieuw';
    const eigenSleutel = sleutel(titel, arrangeur);
    if (titel && gezien.has(eigenSleutel)) fouten.push('Deze titel met deze arrangeur staat eerder in het bestand.');
    else if (titel && bestaand.has(eigenSleutel)) status = 'bestaat';
    if (titel) gezien.add(eigenSleutel);
    if (fouten.length > 0) status = 'fout';

    return {
      rij: i + 2,
      status,
      gegevens: {
        titel,
        componist,
        arrangeur,
        duurSeconden: duur ?? null,
        graad: graad && graad.length <= 20 ? graad : null,
        genres: genreNamen,
        genreIds: [...new Set(genreIds)],
      },
      fouten,
      waarschuwingen,
    };
  });

  return { kolommen, genegeerd, regels };
}

function zonderGenreIds({ genreIds: _g, ...rest }: TitelIntern): TitelGegevens {
  return rest;
}

export function beoordeelTitels(associationId: string, csv: string): Voorbeeld<TitelGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelTitelsIntern(associationId, csv);
  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderGenreIds(regel.gegevens) })),
    tellingen: tel(regels),
  };
}

export function importeerTitels(associationId: string, csv: string): ImportUitkomst<TitelGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelTitelsIntern(associationId, csv);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');

  withTransaction(() => {
    const titel = db.prepare(
      `INSERT INTO music_titles (id, title, composer, arranger, duration_seconds, grade, association_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const genre = db.prepare('INSERT OR IGNORE INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)');

    for (const { gegevens } of nieuw) {
      const id = uuidv4();
      titel.run(
        id,
        gegevens.titel,
        gegevens.componist,
        gegevens.arrangeur,
        gegevens.duurSeconden ?? 0,
        gegevens.graad,
        associationId,
      );
      for (const genreId of gegevens.genreIds) genre.run(id, genreId);
    }
  });

  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderGenreIds(regel.gegevens) })),
    tellingen: tel(regels),
    geimporteerd: nieuw.length,
  };
}
