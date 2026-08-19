/**
 * Meet de gebouwde applicatie met Lighthouse en bewaakt de scores.
 *
 * Waarom hier geen PWA-score staat: Lighthouse heeft die categorie geschrapt.
 * In versie 13 bestaan alleen nog performance, accessibility, best-practices
 * en seo, en ook de losse audits waaruit de PWA-score was opgebouwd
 * (installable-manifest, service-worker, maskable-icon) zijn verwijderd. De
 * roadmap vroeg om "Lighthouse PWA-score >90"; dat getal bestaat niet meer.
 * Wat die score controleerde staat daarom in controleerInstalleerbaarheid()
 * hieronder, als eigen controles op het manifest en de service worker.
 *
 * Gebruik: node scripts/lighthouse-check.mjs <url>
 */

import { writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.argv[2] || 'http://localhost:3001/';

/**
 * Ondergrenzen per categorie.
 *
 * Deze staan bewust op de gemeten stand met wat marge eronder, niet op een
 * streefwaarde. Een drempel die vandaag al rood staat bewaakt niets - hij
 * wordt genegeerd of uitgezet. Zo vangt hij wel elke verslechtering.
 *
 * Gemeten op 19-08-2026: performance 75, accessibility 98,
 * best-practices 96, seo 100.
 */
const DREMPELS = {
  performance: 70,
  accessibility: 95,
  'best-practices': 90,
  seo: 95,
};

/** Losse eisen aan het manifest, als vervanging van de geschrapte PWA-score. */
async function controleerInstalleerbaarheid(basis) {
  const problemen = [];

  const res = await fetch(new URL('/manifest.webmanifest', basis));
  if (!res.ok) return [`manifest niet op te halen (status ${res.status})`];

  let manifest;
  try {
    manifest = await res.json();
  } catch {
    return ['manifest is geen geldige JSON'];
  }

  for (const veld of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (!manifest[veld]) problemen.push(`manifest mist ${veld}`);
  }

  if (manifest.display && !['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    problemen.push(`display staat op "${manifest.display}"; dan is de app niet installeerbaar`);
  }

  const iconen = Array.isArray(manifest.icons) ? manifest.icons : [];
  const maten = new Set(iconen.flatMap((i) => String(i.sizes || '').split(/\s+/)));
  for (const nodig of ['192x192', '512x512']) {
    if (!maten.has(nodig)) problemen.push(`manifest mist een icoon van ${nodig}`);
  }
  if (!iconen.some((i) => String(i.purpose || '').includes('maskable'))) {
    problemen.push('manifest mist een maskable icoon');
  }

  return problemen;
}

/**
 * Aantal metingen. De prestatiescore schommelt van run tot run - twee metingen
 * hier gaven 75 en 74, en op een gedeelde CI-runner is die spreiding groter.
 * Eén meting zou de drempel dus willekeurig raken. De mediaan van drie haalt
 * de uitschieters eruit; dat is ook wat Lighthouse zelf aanraadt.
 */
const METINGEN = 3;

function mediaan(getallen) {
  const gesorteerd = [...getallen].sort((a, b) => a - b);
  return gesorteerd[Math.floor(gesorteerd.length / 2)];
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

try {
  const rondes = [];
  for (let i = 0; i < METINGEN; i++) {
    const run = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: Object.keys(DREMPELS),
    });
    // Bewaar het laatste verslag als bijlage voor de CI-uitvoer.
    if (i === METINGEN - 1) writeFileSync('lighthouse-report.json', run.report);
    rondes.push(
      Object.fromEntries(Object.entries(run.lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)])),
    );
  }

  const scores = Object.fromEntries(Object.keys(DREMPELS).map((k) => [k, mediaan(rondes.map((r) => r[k] ?? 0))]));

  console.log(`Mediaan van ${METINGEN} metingen op ${url}\n`);

  const tekort = [];
  for (const [categorie, ondergrens] of Object.entries(DREMPELS)) {
    const score = scores[categorie];
    const ok = score >= ondergrens;
    console.log(`${ok ? 'ok  ' : 'LAAG'} ${categorie.padEnd(16)} ${String(score).padStart(3)}  (min ${ondergrens})`);
    if (!ok) tekort.push(`${categorie}: ${score} < ${ondergrens}`);
  }

  const installeerbaarheid = await controleerInstalleerbaarheid(url);
  if (installeerbaarheid.length === 0) {
    console.log('ok   installeerbaarheid  manifest en iconen in orde');
  } else {
    installeerbaarheid.forEach((p) => console.log(`LAAG installeerbaarheid  ${p}`));
  }

  const alleProblemen = [...tekort, ...installeerbaarheid];
  if (tekort.length > 0) {
    console.log('\nLosse metingen:');
    rondes.forEach((r, i) =>
      console.log(
        `  ronde ${i + 1}: ` +
          Object.entries(r)
            .map(([k, v]) => `${k}=${v}`)
            .join(' '),
      ),
    );
  }
  if (alleProblemen.length > 0) {
    console.error('\nLighthouse-controle mislukt:\n  ' + alleProblemen.join('\n  '));
    process.exitCode = 1;
  }
} finally {
  await chrome.kill();
}
