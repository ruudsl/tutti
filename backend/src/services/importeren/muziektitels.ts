/** De muziekbibliotheek inlezen uit een spreadsheet. Zie index.ts en docs/IMPORTEREN.md. */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import {
  herkenKolommen,
  lees,
  lijst,
  tel,
  type Beoordeling,
  type ImportUitkomst,
  type RegelStatus,
  type Veld,
  type Voorbeeld,
} from './gemeenschappelijk';

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
