/**
 * Deze applicatie logt niet in via cookies, en dat is geen detail.
 *
 * CodeQL meldt op `app.use(cookieParser())` in index.ts dat er handlers
 * bediend worden zonder CSRF-bescherming. Die melding staat uit in
 * .github/codeql-config.yml, en de reden daarvoor is deze: een CSRF-aanval
 * werkt doordat de browser bij een verzoek vanaf een vreemde site vanzelf
 * inloggegevens meestuurt. Hier gebeurt dat niet - authenticateToken leest het
 * token uit de Authorization-header, of bij downloads uit een query-parameter,
 * maar nooit uit een cookie. De enige cookie die de applicatie zet is het
 * CSRF-token zelf. Er is dus niets wat een aanvaller ongemerkt kan laten
 * meesturen.
 *
 * Die redenering is alleen geldig zolang hij klopt. Zou er ooit een
 * sessiecookie of een inlogcookie bijkomen, dan is de CodeQL-melding wél
 * terecht en staat hij uit - precies de situatie waarin je hem nodig hebt.
 *
 * Deze test leest daarom de bron. Valt hij om, haal dan eerst de uitsluiting
 * uit .github/codeql-config.yml weg voordat je hem "oplost".
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const BRON = path.join(__dirname, '../..');

function bronbestanden(map: string): string[] {
  const gevonden: string[] = [];
  for (const item of fs.readdirSync(map, { withFileTypes: true })) {
    const volledig = path.join(map, item.name);
    if (item.isDirectory()) {
      if (item.name === '__tests__' || item.name === 'node_modules') continue;
      gevonden.push(...bronbestanden(volledig));
    } else if (item.name.endsWith('.ts')) {
      gevonden.push(volledig);
    }
  }
  return gevonden;
}

describe('er wordt niet met cookies ingelogd', () => {
  it('authenticateToken leest geen cookie', () => {
    const auth = fs.readFileSync(path.join(BRON, 'middleware/auth.ts'), 'utf-8');

    expect(auth).not.toMatch(/req\.cookies/);
    expect(auth).not.toMatch(/cookie-parser|cookieParser/);
  });

  it('geen enkele middleware haalt inloggegevens uit een cookie', () => {
    const overtredingen: string[] = [];

    for (const bestand of bronbestanden(path.join(BRON, 'middleware'))) {
      const inhoud = fs.readFileSync(bestand, 'utf-8');
      inhoud.split('\n').forEach((regel, index) => {
        if (/req\.cookies/.test(regel)) {
          overtredingen.push(`${path.relative(BRON, bestand)}:${index + 1} — ${regel.trim()}`);
        }
      });
    }

    // middleware/csrf.ts leest zijn eigen cookie; dat is de token-controle
    // zelf en geen authenticatie.
    const buitenCsrf = overtredingen.filter((r) => !r.startsWith('middleware/csrf.ts'));
    expect(buitenCsrf).toEqual([]);
  });

  it('de enige cookie die de applicatie zet is het CSRF-token', () => {
    const zetters: string[] = [];

    for (const bestand of bronbestanden(BRON)) {
      const inhoud = fs.readFileSync(bestand, 'utf-8');
      inhoud.split('\n').forEach((regel, index) => {
        if (/res\.cookie\(/.test(regel)) {
          zetters.push(`${path.relative(BRON, bestand)}:${index + 1}`);
        }
      });
    }

    expect(zetters.every((r) => r.startsWith('middleware/csrf.ts'))).toBe(true);
  });
});
