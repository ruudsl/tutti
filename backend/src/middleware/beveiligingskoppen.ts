/**
 * Beveiligingskoppen voor de applicatie in de browser.
 *
 * De HTML van de applicatie komt meestal niet van Express: in de
 * Docker-opstelling serveert nginx hem (met Traefik ervoor), op Vercel
 * Vercel zelf. Een Content-Security-Policy die alleen helmet zet, bereikt
 * die pagina dus nooit - en juist daar draait het script dat een CSP moet
 * beschermen. Daarom staat het beleid hier één keer, en staat dezelfde tekst
 * in `frontend/nginx.conf`, `docker-compose.prod.yml` en `frontend/vercel.json`.
 * `__tests__/beveiligingskoppen-hosting.test.ts` vergelijkt die bestanden met
 * wat hieronder staat; pas je hier iets aan, dan zegt die test welke tekst
 * erin hoort.
 *
 * Wat de applicatie nodig heeft, en waarom het er staat:
 *
 * - Scripts alleen van de eigen herkomst. De gebouwde `index.html` heeft geen
 *   inline script (de stylesheet staat er wel inline in, vandaar
 *   'unsafe-inline' bij style-src). De uitzonderingen zijn scripts die de
 *   applicatie zelf van buiten laadt: MSAL voor OneDrive, Google, hCaptcha.
 * - Afbeeldingen en geluid ook van andere https-adressen: omslagen, logo's
 *   van de API, voorbeeldfragmenten van Spotify en Apple Music, en de MP3's
 *   van de API als die op een andere host draait.
 * - blob: voor de PDF-lezer, opnames en downloads; de werker van pdf.js en de
 *   service worker komen van de eigen herkomst.
 * - Websockets: 'self' dekt in CSP3 ook ws: en wss: naar dezelfde host.
 */

import type { RequestHandler } from 'express';
import type { HelmetOptions } from 'helmet';

export type Richtlijnen = Record<string, string[]>;

const HCAPTCHA = ['https://hcaptcha.com', 'https://*.hcaptcha.com'];

/** Het beleid voor de pagina van de applicatie, zoals elke host het meestuurt. */
export const SPA_CSP: Readonly<Richtlijnen> = Object.freeze({
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    // Geen 'unsafe-inline' of 'unsafe-eval': de productiebuild laadt alleen
    // losse modulescripts.
    'https://www.youtube.com',
    'https://s.ytimg.com',
    'https://alcdn.msauth.net',
    'https://apis.google.com',
    'https://accounts.google.com',
    ...HCAPTCHA,
  ],
  // Geen onclick="…" en verwanten.
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'", ...HCAPTCHA],
  // Het lettertype komt uit het project zelf.
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
  frameSrc: [
    "'self'",
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
    'https://accounts.google.com',
    'https://docs.google.com',
    'https://login.microsoftonline.com',
    ...HCAPTCHA,
  ],
  connectSrc: [
    "'self'",
    'https://graph.microsoft.com',
    'https://login.microsoftonline.com',
    'https://www.googleapis.com',
    'https://accounts.google.com',
    ...HCAPTCHA,
  ],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  // Alleen de applicatie zelf mag zich in een frame zetten; tegen clickjacking.
  frameAncestors: ["'self'"],
  workerSrc: ["'self'", 'blob:'],
  childSrc: ["'self'", 'blob:'],
  manifestSrc: ["'self'"],
  upgradeInsecureRequests: [],
});

/**
 * Welke functies van de browser de pagina mag gebruiken. Camera voor de
 * kaartjesscanner, microfoon voor opnemen en het stemapparaat; de rest van wat
 * hier staat gebruikt de applicatie niet, en een ingesloten frame dus ook niet.
 */
export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=()';

/** Geen Referer: een adres als /reset-password?token=… hoort bij niemand anders. */
export const REFERRER_POLICY = 'no-referrer';

export type Hosting = 'nginx' | 'traefik' | 'vercel';

/**
 * Het beleid zoals één host het meestuurt.
 *
 * - **nginx** serveert ook de Docker-opstelling op `http://localhost:5173`, en
 *   zelfhosters zetten hem soms zonder TLS op hun eigen netwerk.
 *   upgrade-insecure-requests zou daar elk script naar https omzetten en de
 *   pagina leeg laten. Daar zorgt de proxy ervoor (Traefik zet het wel).
 * - **vercel** heeft de API op een andere host (Render), en welke dat is
 *   weet dit bestand niet: die staat in VITE_API_URL van de build. Daarom
 *   https: en wss: bij connect-src.
 */
export function cspVoorHosting(hosting: Hosting): Richtlijnen {
  const richtlijnen: Richtlijnen = { ...SPA_CSP };
  if (hosting === 'nginx') delete richtlijnen.upgradeInsecureRequests;
  if (hosting === 'vercel') richtlijnen.connectSrc = [...SPA_CSP.connectSrc, 'https:', 'wss:'];
  return richtlijnen;
}

/** `defaultSrc` → `default-src`, zoals helmet het ook doet. */
function kebab(naam: string): string {
  return naam.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Het beleid als waarde van de kop Content-Security-Policy. */
export function cspTekst(richtlijnen: Richtlijnen): string {
  return Object.entries(richtlijnen)
    .map(([naam, waarden]) => [kebab(naam), ...waarden].join(' '))
    .join('; ');
}

export interface KoppenInstellingen {
  isProduction: boolean;
  frontendUrl: string;
  cspReportUri?: string;
}

/**
 * De opties voor helmet.
 *
 * Buiten productie geen CSP: de ontwikkelserver van Vite (HMR, React
 * refresh) heeft eval en inline scripts nodig.
 */
export function helmetOpties(instellingen: KoppenInstellingen): HelmetOptions {
  let contentSecurityPolicy: HelmetOptions['contentSecurityPolicy'] = false;

  if (instellingen.isProduction) {
    const directives: Richtlijnen = {
      ...SPA_CSP,
      connectSrc: [...SPA_CSP.connectSrc, instellingen.frontendUrl],
    };
    if (instellingen.cspReportUri) directives.reportUri = [instellingen.cspReportUri];
    // useDefaults uit: wat er geldt staat hierboven, en nergens anders.
    contentSecurityPolicy = { useDefaults: false, directives };
  }

  return {
    contentSecurityPolicy,
    crossOriginEmbedderPolicy: false, // YouTube-video's insluiten
    referrerPolicy: { policy: REFERRER_POLICY },
  };
}

/** Zet Permissions-Policy; helmet kent die kop niet. */
export const permissionsPolicy: RequestHandler = (_req, res, next) => {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  next();
};
