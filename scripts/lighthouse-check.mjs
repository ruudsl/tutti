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
 * Chrome valt op een gedeelde runner soms om. Daar is de lus met pogingen
 * hieronder voor: een mislukte ronde telt als mislukt en de volgende volgt.
 *
 * Maar niet elke fout komt bij die afvang uit. Lighthouse houdt per
 * protocolopdracht een promise bij, en als de browser omvalt verwerpt hij die
 * allemaal - ook de opdrachten waar op dat moment niemand meer op wacht,
 * bijvoorbeeld omdat de ronde al is afgehandeld of de browser net wordt
 * afgesloten. Zo'n losse verwerping heeft geen afvang, en daar stopt Node het
 * hele proces op. Dat is precies wat er in CI gebeurde: exit 1 met
 * `LighthouseError: TARGET_CRASHED` en geen enkele meting, terwijl de lus er
 * juist op gebouwd is dat dit een keer misgaat.
 *
 * Een omgevallen browser mag hier dus geen proces slopen. Alles wat daar niet
 * op lijkt wel: dan is er iets anders aan de hand en hoort de meting te
 * stoppen in plaats van stilletjes door te gaan.
 */
const BROWSERFOUTEN = [
  'TARGET_CRASHED',
  'PROTOCOL_TIMEOUT',
  'CRI_TIMEOUT',
  'Session closed',
  'Target closed',
  'Protocol error',
  'WebSocket is not open',
  'socket hang up',
];

process.on('unhandledRejection', (reden) => {
  const melding = reden instanceof Error ? `${reden.code ?? ''} ${reden.message}` : String(reden);
  if (BROWSERFOUTEN.some((f) => melding.includes(f))) {
    console.log(`losse verwerping van een omgevallen browser genegeerd: ${melding.trim()}`);
    return;
  }
  throw reden;
});

/**
 * Ondergrenzen per categorie.
 *
 * Deze staan bewust op de gemeten stand met wat marge eronder, niet op een
 * streefwaarde. Een drempel die vandaag al rood staat bewaakt niets - hij
 * wordt genegeerd of uitgezet. Zo vangt hij wel elke verslechtering.
 *
 * Gemeten op 24-08-2026: performance 91, accessibility 98, best-practices
 * 100, seo 100.
 *
 * De sprong van 80 naar 91 zat vrijwel helemaal in wat de browser moest
 * ophalen en ontleden voordat er iets op het scherm stond. De hoofdbundel ging
 * van 905 KB naar 296 KB doordat de Engelse en de Duitse vertalingen eruit
 * zijn (610 KB JSON die een Nederlandse gebruiker nooit aanraakt), doordat
 * Layout en de toestemmingspoort nu pas na het inloggen worden opgehaald - met
 * dexie eraan vast - en doordat date-fns, ua-parser-js en idb niet langer in
 * dezelfde vendorchunk zitten als axios. De stylesheet staat sinds deze ronde
 * ingelijnd in de HTML en houdt het tekenen dus niet meer op.
 *
 * Best-practices ging van 96 naar 100 toen de service worker eindelijk kon
 * registreren; zie controleerServiceWorker() hieronder.
 *
 * Wat er nog ligt: van de 236 KB (ingepakt) die vóór de eerste weergave binnen
 * moet zijn, is ongeveer 55 KB het Nederlandse vertaalbestand. Dat opsplitsen
 * per pagina is de volgende stap, en een grotere dan hij lijkt: 5.149 sleutels
 * zonder namespaces in de aanroepen.
 *
 * Daarvoor stond performance op 75. Dat cijfer ging grotendeels over de
 * meetopstelling: er stond een stylesheet van fonts.googleapis.com in de head,
 * die host is hier geblokkeerd, en het verzoek blokkeerde het tekenen tot het
 * na 12,9 seconden opgaf. Sinds het lettertype meekomt met het project is dat
 * weg, en controleert controleerVerzoeken() bovendien dat zoiets niet nog eens
 * onopgemerkt in een cijfer verdwijnt.
 */
const DREMPELS = {
  performance: 88,
  accessibility: 95,
  'best-practices': 95,
  seo: 95,
};

/**
 * Controleer of alle verzoeken zijn aangekomen.
 *
 * Dit is er omdat de meting een keer volstrekt misleidend was. De pagina bleef
 * dertien seconden wit, Speed Index kwam op nul en de prestatiescore op 75. De
 * oorzaak bleek niet in de applicatie te zitten maar in de meetopstelling: een
 * stylesheet van fonts.googleapis.com deed er 12,9 seconden over en faalde
 * toen, omdat die host in de meetomgeving geblokkeerd is. Een verwijzing in de
 * head blokkeert het tekenen, dus de hele meting ging over dat ene verzoek.
 *
 * Lighthouse meldt dat nergens als probleem; het cijfer komt er gewoon lager
 * uit. Zonder deze controle stuurt zo'n uitkomst je urenlang de verkeerde kant
 * op - dat is precies wat er gebeurde.
 *
 * Een verzoek dat niet aankomt maakt de uitkomst onbruikbaar, dus dat is hier
 * een fout en geen voetnoot.
 */
function controleerVerzoeken(lhr) {
  const verzoeken = lhr?.audits?.['network-requests']?.details?.items ?? [];
  const problemen = [];

  for (const verzoek of verzoeken) {
    const status = verzoek.statusCode;
    const duur = (verzoek.networkEndTime ?? 0) - (verzoek.networkRequestTime ?? 0);
    const kort = String(verzoek.url).slice(0, 90);

    // Lighthouse noteert -1 voor een verzoek dat is afgebroken of nooit
    // beantwoord.
    if (status === -1 || status === undefined) {
      problemen.push(`verzoek kwam niet aan na ${Math.round(duur)} ms: ${kort}`);
    } else if (status >= 400) {
      problemen.push(`verzoek gaf status ${status}: ${kort}`);
    }
  }

  return problemen;
}

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

  problemen.push(...(await controleerServiceWorker(basis)));

  return problemen;
}

/**
 * De service worker moet te evalueren zijn, anders is er geen PWA.
 *
 * Aanleiding: `offline.html` stond twee keer in de precachelijst, met twee
 * verschillende revisies. Workbox weigert dat en gooit
 * `add-to-cache-list-conflicting-entries` - niet bij het installeren maar al
 * bij het evalueren van het script. Registreren liep daardoor altijd stuk op
 * "ServiceWorker script evaluation failed", in elke browser en ook in
 * productie. Weg waren de precache, het offline gebruik, de
 * achtergrondmeldingen en de installatie als app.
 *
 * Niets in de meting merkte daar iets van. Lighthouse heeft de PWA-audits
 * geschrapt, de applicatie logde de fout naar de console en werkte verder
 * gewoon door. Vandaar deze controle: de precachelijst uit het gebouwde
 * script halen en kijken of er geen URL twee keer in staat. Dat is precies de
 * voorwaarde waar workbox op afgaat.
 */
async function controleerServiceWorker(basis) {
  const problemen = [];

  const res = await fetch(new URL('/sw-custom.js', basis));
  if (!res.ok) return [`service worker niet op te halen (status ${res.status})`];

  const script = await res.text();
  if (/^\s*<!doctype html/i.test(script)) {
    return ['service worker geeft HTML terug; de server valt terug op index.html'];
  }

  // De volgorde van de twee velden binnen zo'n vermelding ligt niet vast -
  // vandaar beide varianten. Vandaag schrijft de minifier
  // {"revision":...,"url":...}; dat kan bij een volgende versie omdraaien.
  const perUrl = new Map();
  const vermeldingen = [...script.matchAll(/\{"revision":(null|"[^"]*"),"url":"([^"]+)"\}/g)].map((t) => [t[2], t[1]]);
  vermeldingen.push(...[...script.matchAll(/\{"url":"([^"]+)","revision":(null|"[^"]*")\}/g)].map((t) => [t[1], t[2]]));

  // Workbox rekent elke vermelding om naar een absoluut adres voordat hij op
  // dubbelen controleert, en daar zat de fout ook: `offline.html` uit het
  // globpatroon en `/offline.html` uit de handmatige lijst zijn twee
  // verschillende teksten en hetzelfde bestand. Zonder deze omrekening ziet
  // deze controle het verschil niet en vangt hij precies het geval niet
  // waarvoor hij is geschreven.
  const swAdres = new URL('/sw-custom.js', basis).href;
  const gemeld = new Set();
  for (const [adres, revisie] of vermeldingen) {
    const absoluut = new URL(adres, swAdres).href;
    const eerder = perUrl.get(absoluut);
    if (eerder !== undefined && eerder !== revisie && !gemeld.has(absoluut)) {
      gemeld.add(absoluut);
      problemen.push(`${absoluut} staat twee keer in de precachelijst, met revisie ${eerder} en ${revisie}`);
    }
    perUrl.set(absoluut, revisie);
  }

  if (perUrl.size === 0) {
    problemen.push('geen precachelijst in de service worker gevonden');
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

/**
 * Hoeveel pogingen we hooguit doen om aan METINGEN geldige metingen te komen.
 *
 * Een meting kan mislukken: dan geeft Lighthouse score null terug voor een
 * categorie, of zet hij een runtimeError. Dat is geen score van nul maar een
 * meting die niet is gelukt, en zo hoort hij ook geteld te worden. Eerder ging
 * dat mis: drie rondes gaven 67, 0 en 82, waarbij die 0 een mislukte meting
 * was. De mediaan kwam daardoor op 67 uit in plaats van op 82, en de controle
 * sloeg alarm over iets wat niet was gemeten.
 */
const MAX_POGINGEN = METINGEN * 3;

function mediaan(getallen) {
  const gesorteerd = [...getallen].sort((a, b) => a - b);
  return gesorteerd[Math.floor(gesorteerd.length / 2)];
}

/**
 * Elke ronde krijgt een eigen browser.
 *
 * Op de CI-runner viel Chrome er een keer middenin uit, en omdat alle drie de
 * metingen dezelfde browser deelden nam hij de hele stap mee: "connect
 * ECONNREFUSED 127.0.0.1:37127" als onafgevangen fout, zonder cijfer. Een
 * browser die crasht is hetzelfde geval als een meting zonder score - de
 * meting ging mis, de pagina zegt er niets mee. Daarom start hij per ronde
 * opnieuw en telt zo'n ronde gewoon als mislukt, waarna de volgende poging
 * volgt.
 */
async function meetEenRonde() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-software-rasterizer',
    ],
  });

  try {
    return await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: Object.keys(DREMPELS),
    });
  } finally {
    // kill() geeft in deze versie van chrome-launcher niets terug, geen
    // promise. `await chrome.kill().catch(...)` wierp daarom zelf, in het
    // finally-blok, en nam elke ronde mee voordat het resultaat eruit kwam.
    try {
      await chrome.kill();
    } catch {
      // Een browser die al weg is hoeft niet nog eens te sluiten.
    }

    // En dan het geval waar kill() niets meer aan te doen heeft: een browser
    // die al gecrasht was. Zijn kindproces blijft dan als handle aan de
    // gebeurtenislus hangen, waardoor node na afloop niet meer afsluit. In CI
    // zag je precies dat: alle metingen klaar en afgedrukt, en daarna twaalf
    // minuten stilte tot de job werd afgebroken - met chrome en
    // chrome_crashpad_handler nog in de lijst met weesprocessen.
    try {
      chrome.process?.kill('SIGKILL');
      chrome.process?.unref();
    } catch {
      // Ook goed: dan was hij echt weg.
    }
  }
}

{
  const rondes = [];
  // De laatste geslaagde meting blijft bewaard: daar kijkt de netwerkcontrole naar.
  let laatste = null;
  let mislukt = 0;

  for (let poging = 0; rondes.length < METINGEN && poging < MAX_POGINGEN; poging++) {
    let run;
    try {
      run = await meetEenRonde();
    } catch (fout) {
      mislukt++;
      console.log(`meting overgeslagen: browser liep vast (${fout.message})`);
      continue;
    }

    // Een categorie zonder score is niet gemeten. Zo'n ronde meetellen als nul
    // zou een storing in de meting verwarren met een trage pagina.
    const ontbreekt = Object.keys(DREMPELS).filter((k) => typeof run.lhr.categories[k]?.score !== 'number');
    if (run.lhr.runtimeError || ontbreekt.length > 0) {
      mislukt++;
      const reden = run.lhr.runtimeError?.message || `geen score voor ${ontbreekt.join(', ')}`;
      console.log(`meting overgeslagen: ${reden}`);
      continue;
    }

    laatste = run.lhr;
    writeFileSync('lighthouse-report.json', run.report);
    rondes.push(Object.fromEntries(Object.entries(run.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])));
  }

  if (rondes.length < METINGEN) {
    console.error(
      `\nLighthouse kwam niet aan ${METINGEN} geldige metingen (${rondes.length} gelukt, ${mislukt} mislukt).`,
    );
    console.error('Dat zegt niets over de scores; de meting zelf ging mis.');
    process.exit(1);
  }

  if (mislukt > 0) {
    console.log(`(${mislukt} meting${mislukt === 1 ? '' : 'en'} overgeslagen en opnieuw gedaan)\n`);
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

  const mislukteVerzoeken = controleerVerzoeken(laatste);
  if (mislukteVerzoeken.length === 0) {
    console.log('ok   verzoeken         alles aangekomen');
  } else {
    mislukteVerzoeken.forEach((p) => console.log(`FOUT verzoeken         ${p}`));
  }

  const installeerbaarheid = await controleerInstalleerbaarheid(url);
  if (installeerbaarheid.length === 0) {
    console.log('ok   installeerbaarheid  manifest, iconen en precachelijst in orde');
  } else {
    installeerbaarheid.forEach((p) => console.log(`LAAG installeerbaarheid  ${p}`));
  }

  const alleProblemen = [...mislukteVerzoeken, ...tekort, ...installeerbaarheid];
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

  // Expliciet afsluiten. Het werk is hier klaar en het rapport staat al op
  // schijf, maar een enkele achtergebleven handle - een gecrashte browser, een
  // socket die niet opruimt - houdt node anders wachten tot de job in zijn
  // tijdslimiet loopt. Dat leverde een 'cancelled' op terwijl elke drempel
  // gehaald was, wat het vervelendste soort rode CI is: een uitslag die niets
  // zegt over de code.
  //
  // Eerst de uitvoer laten leeglopen, want stdout naar een pijp schrijft niet
  // synchroon en process.exit() zou de laatste regels afkappen.
  await new Promise((klaar) => process.stdout.write('', klaar));
  process.exit(process.exitCode ?? 0);
}
