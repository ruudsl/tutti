/**
 * De HTML-pagina's werken onder de Content-Security-Policy.
 *
 * nginx, Traefik en Vercel sturen bij elke pagina een CSP mee met
 * `script-src 'self' …` zonder 'unsafe-inline', en `script-src-attr 'none'`
 * (zie backend/src/middleware/beveiligingskoppen.ts). Een inline <script> of
 * een onclick="…" wordt dan door de browser genegeerd - zonder foutmelding in
 * de interface, alleen in de console. offline.html had er allebei: de knoppen
 * deden niets meer.
 *
 * Een inline <style> mag wel: style-src staat 'unsafe-inline' toe, en de
 * build zet de stylesheet bewust in index.html (zie vite.config.ts).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const frontend = path.join(__dirname, '../..');

const paginas = [
  'index.html',
  ...fs
    .readdirSync(path.join(frontend, 'public'))
    .filter((naam) => naam.endsWith('.html'))
    .map((naam) => `public/${naam}`),
];

function ontleed(bestand: string): Document {
  const html = fs.readFileSync(path.join(frontend, bestand), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe.each(paginas)('%s onder de CSP', (bestand) => {
  it('heeft geen inline script', () => {
    const inline = [...ontleed(bestand).querySelectorAll('script')].filter(
      (script) => !script.hasAttribute('src') && script.textContent?.trim(),
    );
    expect(inline.map((script) => script.outerHTML.slice(0, 80))).toEqual([]);
  });

  it('heeft geen scripts in attributen (onclick en verwanten)', () => {
    const metHandler = [...ontleed(bestand).querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].filter((attr) => /^on/i.test(attr.name)).map((attr) => `${el.tagName} ${attr.name}`),
    );
    expect(metHandler).toEqual([]);
  });

  it('laadt scripts alleen van de eigen herkomst', () => {
    const extern = [...ontleed(bestand).querySelectorAll('script[src]')]
      .map((script) => script.getAttribute('src') ?? '')
      .filter((src) => /^(https?:)?\/\//i.test(src));
    expect(extern).toEqual([]);
  });
});
