/**
 * De beveiligingskoppen bereiken de pagina van de applicatie.
 *
 * helmet zette een Content-Security-Policy op wat Express serveert, maar de
 * HTML van de applicatie komt van nginx, Traefik of Vercel. Die stuurden geen
 * CSP mee, geen Referrer-Policy en geen Permissions-Policy. De pagina liep dus
 * onbeschermd, en een link als /reset-password?token=… ging als Referer mee
 * naar de API - en naar elke externe dienst die de pagina aanriep.
 *
 * Deze test leest de hostingbestanden zelf en vergelijkt ze met het beleid in
 * middleware/beveiligingskoppen.ts. Wie daar iets toevoegt en een van de
 * bestanden vergeet, ziet hier welke tekst erin hoort.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import {
  cspTekst,
  cspVoorHosting,
  helmetOpties,
  Hosting,
  PERMISSIONS_POLICY,
  permissionsPolicy,
  SPA_CSP,
} from '../middleware/beveiligingskoppen';

const hoofdmap = path.resolve(__dirname, '../../..');
const lees = (bestand: string) => fs.readFileSync(path.join(hoofdmap, bestand), 'utf8');

/** Een CSP-tekst als richtlijn → waarden, zodat volgorde en spaties niet tellen. */
function ontleed(csp: string): Record<string, string[]> {
  const uit: Record<string, string[]> = {};
  for (const deel of csp.split(';')) {
    const [naam, ...waarden] = deel.trim().split(/\s+/);
    if (naam) uit[naam] = waarden.sort();
  }
  return uit;
}

type Koppen = Record<string, string>;

function nginxKoppen(): Koppen {
  const tekst = lees('frontend/nginx.conf');
  const koppen: Koppen = {};
  for (const [, naam, waarde] of tekst.matchAll(/^\s*add_header\s+([\w-]+)\s+"([^"]*)"\s+always;/gm)) {
    koppen[naam.toLowerCase()] = waarde;
  }
  return koppen;
}

function traefikKoppen(): Koppen {
  const tekst = lees('docker-compose.prod.yml');
  const koppen: Koppen = {};
  // Een label staat tussen enkele aanhalingstekens (een ' erin staat dan
  // dubbel) of tussen dubbele; prettier kiest wat de minste tekens kost.
  const label =
    /^\s*- (?:'traefik\.http\.middlewares\.frontend-headers\.headers\.(\w+)=((?:[^']|'')*)'|"traefik\.http\.middlewares\.frontend-headers\.headers\.(\w+)=([^"]*)")\s*$/gm;
  for (const [, optieEnkel, waardeEnkel, optieDubbel, waardeDubbel] of tekst.matchAll(label)) {
    if (optieEnkel) koppen[optieEnkel] = waardeEnkel.replace(/''/g, "'");
    else koppen[optieDubbel] = waardeDubbel;
  }
  return {
    'content-security-policy': koppen.contentSecurityPolicy,
    'referrer-policy': koppen.referrerPolicy,
    'permissions-policy': koppen.permissionsPolicy,
    'x-frame-options': koppen.customFrameOptionsValue,
    'x-content-type-options': koppen.contentTypeNosniff === 'true' ? 'nosniff' : '',
    // frameDeny zou DENY zetten, tegen SAMEORIGIN hierboven in.
    'x-frame-options-deny': koppen.frameDeny ?? '',
  };
}

function vercelKoppen(): Koppen {
  const config = JSON.parse(lees('frontend/vercel.json')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const alles = config.headers?.find((regel) => regel.source === '/(.*)');
  const koppen: Koppen = {};
  for (const { key, value } of alles?.headers ?? []) koppen[key.toLowerCase()] = value;
  return koppen;
}

const hosts: Array<[Hosting, () => Koppen]> = [
  ['nginx', nginxKoppen],
  ['traefik', traefikKoppen],
  ['vercel', vercelKoppen],
];

describe.each(hosts)('koppen van %s', (hosting, koppen) => {
  it('stuurt de CSP uit beveiligingskoppen.ts mee', () => {
    const csp = koppen()['content-security-policy'];
    expect(csp, `verwacht:\n${cspTekst(cspVoorHosting(hosting))}`).toBeTruthy();
    expect(ontleed(csp)).toEqual(ontleed(cspTekst(cspVoorHosting(hosting))));
  });

  it('stuurt geen Referer mee, geen MIME-gokken, en geen frames van anderen', () => {
    const k = koppen();
    expect(k['referrer-policy']).toBe('no-referrer');
    expect(k['x-content-type-options']).toBe('nosniff');
    expect(k['x-frame-options']).toBe('SAMEORIGIN');
    expect(k['x-frame-options-deny'] ?? '').toBe('');
    expect(ontleed(k['content-security-policy'])['frame-ancestors']).toEqual(["'self'"]);
  });

  it('beperkt de functies van de browser', () => {
    expect(koppen()['permissions-policy']).toBe(PERMISSIONS_POLICY);
  });
});

describe('verschillen tussen de hosts', () => {
  it('alleen nginx laat upgrade-insecure-requests weg - die draait ook zonder TLS', () => {
    expect(cspVoorHosting('nginx').upgradeInsecureRequests).toBeUndefined();
    expect(cspVoorHosting('traefik').upgradeInsecureRequests).toEqual([]);
    expect(cspVoorHosting('vercel').upgradeInsecureRequests).toEqual([]);
  });

  it('alleen Vercel mag naar elke https- en wss-host verbinden, want daar staat de API elders', () => {
    expect(cspVoorHosting('vercel').connectSrc).toEqual(expect.arrayContaining(['https:', 'wss:']));
    expect(cspVoorHosting('nginx').connectSrc).not.toContain('https:');
    expect(cspVoorHosting('traefik').connectSrc).not.toContain('https:');
  });

  it('staat nergens inline scripts of eval toe', () => {
    for (const [hosting] of hosts) {
      const scriptSrc = cspVoorHosting(hosting).scriptSrc;
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    }
  });
});

describe('koppen van Express', () => {
  function appMet(isProduction: boolean) {
    const app = express();
    app.use(helmet(helmetOpties({ isProduction, frontendUrl: 'https://tutti.voorbeeld.nl' })));
    app.use(permissionsPolicy);
    app.get('/', (_req, res) => res.send('ok'));
    return app;
  }

  it('zet in productie hetzelfde beleid als de hosts, plus de frontend bij connect-src', async () => {
    const res = await request(appMet(true)).get('/');

    const verwacht = ontleed(
      cspTekst({ ...SPA_CSP, connectSrc: [...SPA_CSP.connectSrc, 'https://tutti.voorbeeld.nl'] }),
    );
    expect(ontleed(res.headers['content-security-policy'])).toEqual(verwacht);
  });

  it('zet Referrer-Policy: no-referrer en Permissions-Policy, ook buiten productie', async () => {
    for (const isProduction of [true, false]) {
      const res = await request(appMet(isProduction)).get('/');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['permissions-policy']).toBe(PERMISSIONS_POLICY);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });
});

/**
 * Het toegangslogboek van Traefik.
 *
 * Met alleen `--accesslog=true` schrijft Traefik elke regel als
 * `"GET /reset-password?token=… HTTP/2.0"`: het volledige adres, met de
 * querystring en de tokens erin, in een logboek dat langer bewaard wordt en
 * breder leesbaar is dan de database. Traefik kan de querystring niet van het
 * pad afhalen; RequestPath en RequestLine (die het pad ook bevat) moeten er
 * dus helemaal uit. Dat gaat met een lijst van wat erin mag, zodat een veld
 * dat Traefik later toevoegt niet vanzelf meekomt.
 *
 * Nagegaan met Traefik 3.0: de regel wordt dan `"GET - HTTP/1.1" 200 …`.
 */
describe('toegangslogboek van Traefik', () => {
  function traefikVlaggen(): string[] {
    const tekst = lees('docker-compose.prod.yml');
    return [...tekst.matchAll(/^\s*- '(--[^']*)'\s*$/gm)].map(([, vlag]) => vlag);
  }
  const accesslog = () => traefikVlaggen().filter((vlag) => vlag.startsWith('--accesslog'));
  const waarde = (naam: string) =>
    accesslog()
      .find((vlag) => vlag.toLowerCase().startsWith(`${naam.toLowerCase()}=`))
      ?.split('=')[1];

  it('draait een Traefik-versie waarvoor deze veldnamen gelden', () => {
    // RequestPath, RequestLine en fields.defaultmode bestaan in v2 en v3.
    expect(lees('docker-compose.prod.yml')).toMatch(/image:\s*traefik:v[23]\./);
  });

  it('laat standaard elk veld en elke kop weg', () => {
    expect(waarde('--accesslog')).toBe('true');
    expect(waarde('--accesslog.fields.defaultmode')).toBe('drop');
    expect(waarde('--accesslog.fields.headers.defaultmode')).toBe('drop');
  });

  it('schrijft het pad met querystring en de Referer niet weg', () => {
    const bewaard = accesslog()
      .map((vlag) => /^--accesslog\.fields\.(?:headers\.)?names\.([^=]+)=(\w+)$/i.exec(vlag))
      .filter((treffer): treffer is RegExpExecArray => !!treffer && treffer[2].toLowerCase() !== 'drop')
      .map(([, veld]) => veld.toLowerCase());

    for (const veld of ['requestpath', 'requestline', 'referer', 'cookie', 'authorization']) {
      expect(bewaard).not.toContain(veld);
    }
    // Wat er wel in staat is genoeg om een storing terug te vinden.
    expect(bewaard).toEqual(expect.arrayContaining(['requestmethod', 'downstreamstatus', 'routername', 'duration']));
  });
});
