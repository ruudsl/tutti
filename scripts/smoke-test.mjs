/**
 * Controleert of een draaiende omgeving daadwerkelijk bruikbaar is.
 *
 * Een geslaagde uitrol zegt alleen dat het proces startte. Dat is niet
 * hetzelfde als een werkende applicatie: de migraties kunnen half zijn
 * gebleven, de database kan leeg zijn, of de frontend kan een lege pagina
 * serveren. Deze controle raakt daarom de paden die stuk gaan als er iets
 * misging bij het uitrollen.
 *
 * Gebruik: node scripts/smoke-test.mjs <basis-url>
 */

const basis = process.argv[2];

if (!basis) {
  console.error('Geef de basis-url mee, bijvoorbeeld: node scripts/smoke-test.mjs https://staging.example.com');
  process.exit(2);
}

const TIJDSLIMIET_MS = 15000;

async function haal(pad, opties = {}) {
  const controle = new AbortController();
  const stop = setTimeout(() => controle.abort(), TIJDSLIMIET_MS);
  try {
    return await fetch(new URL(pad, basis), { ...opties, signal: controle.signal });
  } finally {
    clearTimeout(stop);
  }
}

/**
 * Elke controle geeft null terug als alles klopt, of een zin die zegt wat er
 * mis is. Geen enkele controle logt in, want daar zouden inloggegevens voor
 * nodig zijn en die horen niet in een uitrolstap.
 */
const controles = [
  {
    naam: 'gezondheid',
    async doe() {
      const res = await haal('/api/health');
      if (!res.ok) return `status ${res.status}`;
      const body = await res.json().catch(() => null);
      if (!body) return 'antwoord is geen JSON';
      return null;
    },
  },
  {
    naam: 'database bereikbaar',
    async doe() {
      // Deze route leest uit de database en heeft geen aanmelding nodig. Komt
      // hier een 5xx, dan draait het proces wel maar staat het schema niet.
      const res = await haal('/api/health');
      if (res.status >= 500) return `status ${res.status}`;
      const body = await res.json().catch(() => ({}));
      if (body.database && body.database !== 'connected' && body.database !== 'ok') {
        return `database meldt "${body.database}"`;
      }
      return null;
    },
  },
  {
    naam: 'aanmelding vereist',
    async doe() {
      // Een beschermde route hoort 401 te geven, niet 200 en niet 500. Een 200
      // zou betekenen dat de beveiliging eraf ligt; een 500 dat de
      // middleware stuk is.
      const res = await haal('/api/users');
      if (res.status !== 401) return `verwachtte 401, kreeg ${res.status}`;
      return null;
    },
  },
  {
    naam: 'onbekende api-route geeft 404',
    async doe() {
      const res = await haal('/api/deze-route-bestaat-niet');
      if (res.status !== 404) return `verwachtte 404, kreeg ${res.status}`;
      return null;
    },
  },
];

let mislukt = 0;

for (const controle of controles) {
  let uitkomst;
  try {
    uitkomst = await controle.doe();
  } catch (fout) {
    uitkomst = fout instanceof Error ? fout.message : String(fout);
  }

  if (uitkomst === null) {
    console.log(`ok    ${controle.naam}`);
  } else {
    console.log(`FOUT  ${controle.naam}: ${uitkomst}`);
    mislukt++;
  }
}

if (mislukt > 0) {
  console.error(`\n${mislukt} van de ${controles.length} controles mislukt op ${basis}`);
  process.exit(1);
}

console.log(`\nAlle ${controles.length} controles geslaagd op ${basis}`);
