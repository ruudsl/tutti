/** Leden inlezen uit een spreadsheet. Zie index.ts en docs/IMPORTEREN.md. */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import { ruimteVoorLeden } from '../abonnementLimieten';
import { instrumentenOpNaam } from '../catalogus';
import {
  bepaalWijzigingen,
  herkenKolommen,
  inStukken,
  lees,
  lijst,
  normaliseer,
  tel,
  werkBij,
  type Beoordeling,
  type Bijwerkbaar,
  type Bijwerking,
  type ImportOpties,
  type ImportUitkomst,
  type RegelStatus,
  type Veld,
  type Voorbeeld,
  type Wijziging,
} from './gemeenschappelijk';

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

function beoordeelLedenIntern(associationId: string, csv: string, opties: ImportOpties = {}) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, LEDENVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const instrumenten = instrumentenOpNaam(associationId);
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

  // Bijwerken kan alleen bij wie deze vereniging als eigen vereniging heeft.
  // Wie er via user_associations bij hoort, is ook lid elders; zijn naam
  // wijzigen vanuit het bestand van deze vereniging verandert hem daar ook.
  const bijTeWerken = new Map<string, Record<string, unknown>>();
  if (opties.bijwerken) {
    for (const rij of db
      .prepare(
        'SELECT id, LOWER(email) AS sleutel, first_name, last_name, private_email FROM users WHERE association_id = ? AND deleted_at IS NULL',
      )
      .all(associationId) as Record<string, unknown>[]) {
      bijTeWerken.set(String(rij.sleutel), rij);
    }
  }
  const bijwerkingen: Bijwerking[] = [];

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

    const geldigePriveEmail = priveEmail && emailSchema.safeParse(priveEmail).success ? priveEmail : null;

    // Naam en privé-e-mail; de rol niet. Een rol verandert wat iemand mag, en
    // dat hoort een beheerder per persoon te beslissen, niet per spreadsheet.
    let wijzigingen: Wijziging[] | undefined;
    if (status === 'bestaat' && opties.bijwerken) {
      const gevonden = bijTeWerken.get(email);
      if (!gevonden) {
        waarschuwingen.push('Dit lid hoort ook bij een andere vereniging en wordt hier niet bijgewerkt.');
      } else {
        const velden: Bijwerkbaar[] = [
          { veld: 'voornaam', kolom: 'first_name', waarde: voornaam || null },
          { veld: 'achternaam', kolom: 'last_name', waarde: cel(rij, 'achternaam') ? achternaam : null },
          { veld: 'priveEmail', kolom: 'private_email', waarde: geldigePriveEmail },
        ];
        const bepaald = bepaalWijzigingen(String(gevonden.id), gevonden, velden);
        if (bepaald.wijzigingen.length > 0) {
          status = 'bijwerken';
          wijzigingen = bepaald.wijzigingen;
          bijwerkingen.push(bepaald.bijwerking);
        }
      }
    }

    return {
      rij: i + 2,
      status,
      ...(wijzigingen && { wijzigingen }),
      gegevens: {
        voornaam,
        achternaam,
        email,
        rol: rol ?? 'member',
        instrumenten: instrumentNamen,
        orkesten: orkestNamen,
        priveEmail: geldigePriveEmail,
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

  return { kolommen, genegeerd, regels, bijwerkingen };
}

/** Zonder de interne id's: die gaan niet naar de browser. */
function zonderIds({ instrumentIds: _i, orkestIds: _o, ...rest }: LidIntern): LidGegevens {
  return rest;
}

export function beoordeelLeden(associationId: string, csv: string, opties: ImportOpties = {}): Voorbeeld<LidGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelLedenIntern(associationId, csv, opties);
  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderIds(regel.gegevens) })),
    tellingen: tel(regels),
  };
}

/**
 * Importeer de regels die `nieuw` zijn.
 *
 * Een geïmporteerd lid krijgt geen wachtwoord dat iemand kent en geen mail: het
 * stelt een wachtwoord in via "Wachtwoord vergeten", of de beheerder stuurt de
 * uitnodigingen wanneer de vereniging er klaar voor is. Een import van tachtig
 * leden hoort niet ongevraagd tachtig mails te versturen.
 */
export async function importeerLeden(
  associationId: string,
  csv: string,
  opties: ImportOpties = {},
): Promise<ImportUitkomst<LidGegevens>> {
  const { kolommen, genegeerd, regels, bijwerkingen } = beoordeelLedenIntern(associationId, csv, opties);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');
  let bijgewerkt = 0;

  if (bijwerkingen.length > 0) {
    withTransaction(() => {
      bijgewerkt = werkBij('users', associationId, bijwerkingen);
    });
  }

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
    bijgewerkt,
  };
}
