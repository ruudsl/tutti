/**
 * De shell in index.html: wat er op het scherm staat tot React tekent.
 *
 * Zonder shell was #root leeg, en zag de bezoeker een wit scherm tot alle
 * JavaScript binnen en uitgevoerd was. In de Lighthouse-meting was dat 2,7
 * seconden; met de shell staat er na 0,8 seconden iets.
 *
 * Wat hier vastligt is vooral wat de shell níet mag:
 *  - Tekst bevatten. Die zou vertaald moeten worden, en tekst telt mee als
 *    kandidaat voor de grootste weergave (LCP). Dan meet Lighthouse de shell
 *    in plaats van het inlogscherm, en zegt het cijfer niets meer.
 *  - Een <img> bevatten, om dezelfde reden. Een inline SVG telt wel voor de
 *    eerste weergave en niet voor de LCP.
 *  - Door een schermlezer voorgelezen worden: het is decoratie.
 *  - Leunen op een stylesheet die nog moet komen: .app-shell staat in
 *    index.css, dat bij het bouwen in de <head> wordt ingelijnd.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const frontend = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

function shell(): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.getElementById('root');
  if (!root) throw new Error('index.html heeft geen #root');
  const gevonden = root.querySelector('.app-shell');
  if (!gevonden) throw new Error('#root bevat geen .app-shell');
  return gevonden;
}

describe('de shell in index.html', () => {
  it('staat in #root, zodat React hem bij het eerste tekenen vervangt', () => {
    expect(shell().parentElement?.id).toBe('root');
  });

  it('bevat geen tekst', () => {
    expect(shell().textContent?.trim()).toBe('');
  });

  it('bevat geen afbeelding die als grootste weergave kan tellen', () => {
    expect(shell().querySelector('img, image, video')).toBeNull();
    expect(shell().querySelector('svg')).not.toBeNull();
  });

  it('is verborgen voor schermlezers', () => {
    expect(shell().getAttribute('aria-hidden')).toBe('true');
  });

  it('heeft zijn stijl in de stylesheet die in de HTML wordt ingelijnd', () => {
    const css = fs.readFileSync(path.join(frontend, 'src/index.css'), 'utf8');
    expect(css).toMatch(/\.app-shell\s*\{/);
  });
});
