/**
 * Titel, instrument en partijnummer uit de naam van een geüpload pdf-bestand.
 *
 * Tutti las alleen de eigen vorm met liggende streepjes:
 * `Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel.pdf`. Bij het
 * doorlopen van de app als muziekcommissie bleek dat een bibliotheek zelden zo
 * heet: "Bolero - Trompet 1.pdf" werd een stuk met de titel "Bolero - Trompet
 * 1" en zonder instrument, en verscheen dan bij geen enkel lid in Mijn Muziek.
 *
 * Nu worden ook gewone namen gelezen:
 * - "Bolero - Trompet 1.pdf": titel, dan na het streepje de partij;
 * - "Bolero - Klarinet in Bb 2.pdf", "Bolero - Bb Klarinet 2.pdf": met stemming;
 * - "Bolero Trompet 1.pdf": zonder streepje, als de laatste woorden een
 *   instrument zijn dat de vereniging kent (`kentInstrument`).
 * De vorm met liggende streepjes werkt zoals altijd.
 */

export interface BestandsnaamGegevens {
  title: string;
  arranger: string | null;
  instrument: string | null;
  tuning: string | null;
  groupNumber: string | null;
  clef: string | null;
}

/** Stemmingen die als los woord in een partijnaam staan: "Bb Klarinet", "Hoorn in F". */
const STEMMING = /^(bb|eb|ab|bes|es|as)$/i;
const STEMMING_NA_IN = /^(bb|eb|ab|bes|es|as|f|c|d|g|a|e)$/i;
const STREEPJES = new Set(['-', '–', '—']);
const isWit = (teken: string | undefined) => teken !== undefined && /\s/.test(teken);

/**
 * Splitst op een streepje met witruimte aan beide kanten: "Bolero - Trompet 1".
 * Met de hand in plaats van met `split(/\s+-\s+/)`: die reguliere expressie
 * kost kwadratische tijd op een naam met veel spaties achter elkaar, en de
 * naam komt van de gebruiker.
 */
function splitsOpStreepje(naam: string): string[] {
  const delen: string[] = [];
  let begin = 0;
  for (let i = 0; i < naam.length; i++) {
    if (STREEPJES.has(naam[i]) && isWit(naam[i - 1]) && isWit(naam[i + 1])) {
      delen.push(naam.slice(begin, i).trim());
      begin = i + 1;
    }
  }
  delen.push(naam.slice(begin).trim());
  return delen;
}

export function leesBestandsnaam(
  bestandsnaam: string,
  kentInstrument?: (naam: string) => boolean,
): BestandsnaamGegevens {
  const naam = bestandsnaam.replace(/\.pdf$/i, '').trim();

  if (naam.includes('_')) {
    const delen = naam.split('_');
    return {
      title: delen[0] || bestandsnaam,
      arranger: delen[1] || null,
      instrument: delen[2] || null,
      tuning: delen[3] || null,
      groupNumber: delen[4] || null,
      clef: delen[5] || null,
    };
  }

  const leeg = {
    title: naam || bestandsnaam,
    arranger: null,
    instrument: null,
    tuning: null,
    groupNumber: null,
    clef: null,
  };

  let titel: string;
  let partij: string;
  const delen = splitsOpStreepje(naam);
  if (delen.length >= 2) {
    titel = delen.slice(0, -1).join(' - ').trim();
    partij = delen[delen.length - 1].trim();
  } else {
    // Zonder streepje alleen als de laatste woorden een bekend instrument zijn;
    // anders is "Mars der Medici 2" niet van "Mars der" plus een partij te
    // onderscheiden.
    const woorden = naam.split(/\s+/);
    const nummer = /^\d+$/.test(woorden[woorden.length - 1]) ? woorden.pop()! : null;
    let gevonden = -1;
    for (let aantal = Math.min(3, woorden.length - 1); aantal >= 1 && kentInstrument; aantal--) {
      if (kentInstrument(woorden.slice(woorden.length - aantal).join(' '))) {
        gevonden = woorden.length - aantal;
        break;
      }
    }
    if (gevonden < 1) return leeg;
    titel = woorden.slice(0, gevonden).join(' ');
    partij = [...woorden.slice(gevonden), ...(nummer ? [nummer] : [])].join(' ');
  }

  if (!titel || !partij) return leeg;
  const gelezen = leesPartij(partij, kentInstrument);
  // Een streepje staat ook in titels: "Pirates of the Caribbean - Medley".
  // Alleen als het laatste deel op een partij lijkt - een instrument dat de
  // vereniging kent, een partijnummer of een stemming - wordt het gesplitst.
  const lijktOpPartij =
    !!gelezen.instrument && (!!gelezen.groupNumber || !!gelezen.tuning || !!kentInstrument?.(gelezen.instrument));
  if (!lijktOpPartij) return leeg;
  return { ...gelezen, title: titel, arranger: null, clef: null };
}

/** "Trompet 1", "Klarinet in Bb 2", "Bb Klarinet": instrument, stemming en nummer. */
function leesPartij(partij: string, kentInstrument?: (naam: string) => boolean) {
  const woorden = partij.split(/\s+/);
  const groupNumber = /^\d+$/.test(woorden[woorden.length - 1]) ? woorden.pop()! : null;

  // Kent de vereniging de naam inclusief stemming ("Bb Klarinet" als andere
  // naam), dan is dat het instrument.
  const volledig = woorden.join(' ');
  if (kentInstrument?.(volledig)) return { instrument: volledig, tuning: null, groupNumber };

  let tuning: string | null = null;
  const rest: string[] = [];
  for (let i = 0; i < woorden.length; i++) {
    const woord = woorden[i];
    if (woord.toLowerCase() === 'in' && STEMMING_NA_IN.test(woorden[i + 1] ?? '')) {
      tuning = woorden[i + 1];
      i++;
    } else if (STEMMING.test(woord) && woorden.length > 1) {
      tuning = woord;
    } else {
      rest.push(woord);
    }
  }
  return { instrument: rest.join(' ') || null, tuning, groupNumber };
}
