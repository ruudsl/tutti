/**
 * Nepserver voor de tests van src/api.ts.
 *
 * De bestaande src/api/__tests__/nepserver.ts hangt onder de gedeelde instantie
 * uit src/api/client.ts. src/api.ts maakt op regel 58 een eigen axios-instantie
 * en die deelt niets met client.ts, dus die nepserver werkt hier niet.
 *
 * Waarom een eigen adapter en geen vi.mock('axios')
 * -------------------------------------------------
 * We onderscheppen op adapterniveau, net als de nepserver van client.ts. Alles
 * boven de adapter blijft dan echt: de twee interceptors van api.ts, mergeConfig,
 * de opbouw van baseURL + pad + queryreeks, en het omzetten van de body naar
 * JSON. We toetsen dus wat er echt over de lijn zou gaan en niet welke
 * argumenten aan `api.get` zijn meegegeven.
 *
 * Met vi.mock('axios') zou de hele module vervangen worden. Dan draaien de
 * interceptors niet meer - en juist die interceptors (401 wel/niet uitloggen,
 * token-injectie) zijn hier het interessantste stuk gedrag.
 *
 * Hoe we bij de instantie komen
 * -----------------------------
 * api.ts sluit af met `export default api;` (regel 3967): de instantie is dus
 * gewoon de standaardexport. Er is geen truc nodig met axios.defaults of met
 * het bespioneren van axios.create. Dat laatste zou hier trouwens niet werken:
 * axios.create() kopieert axios.defaults.adapter op het moment van aanmaken naar
 * de instantie, dus axios.defaults.adapter later aanpassen raakt deze instantie
 * niet meer.
 */

import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import api from '../api';

/** Eén onderschept verzoek, in de vorm waarin het verstuurd zou zijn. */
export interface Verzoek {
  /** Methode in kleine letters, bijvoorbeeld 'get'. */
  methode: string;
  /** Het pad zoals de api-functie het meegaf, zonder baseURL. */
  pad: string;
  /** Volledig adres inclusief baseURL en queryreeks, zoals axios het bouwt. */
  uri: string;
  /** Alles na het vraagteken; lege string als er geen queryreeks is. */
  queryreeks: string;
  /** De queryreeks ontleed, zodat je op gedecodeerde waarden kunt toetsen. */
  query: URLSearchParams;
  /** De body, uit JSON teruggelezen. `undefined` als er geen body was. */
  body: unknown;
  headers: Record<string, unknown>;
  responseType?: string;
  timeout?: number;
  /**
   * De voortgangsmelder die de aanroeper meegaf. Een echte adapter roept die
   * tijdens het versturen aan; hier bewaren we hem zodat een test hem zelf kan
   * uitvoeren en de omrekening naar procenten kan toetsen.
   */
  onUploadProgress?: InternalAxiosRequestConfig['onUploadProgress'];
}

type Antwoord =
  | { soort: 'gelukt'; status: number; data: unknown; headers: Record<string, string> }
  | { soort: 'netwerkfout' }
  | { soort: 'onderbroken' };

const verzoeken: Verzoek[] = [];
const wachtrij: Antwoord[] = [];
let standaardAntwoord: Antwoord = { soort: 'gelukt', status: 200, data: {}, headers: {} };
let origineleAdapter: typeof api.defaults.adapter;
let adapterBewaard = false;

function leesBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  const uri = api.getUri(config);
  const vraagteken = uri.indexOf('?');
  const queryreeks = vraagteken === -1 ? '' : uri.slice(vraagteken + 1);

  verzoeken.push({
    methode: (config.method || 'get').toLowerCase(),
    pad: config.url || '',
    uri,
    queryreeks,
    query: new URLSearchParams(queryreeks),
    body: leesBody(config.data),
    headers: config.headers instanceof AxiosHeaders ? (config.headers.toJSON() as Record<string, unknown>) : {},
    responseType: config.responseType,
    timeout: config.timeout,
    onUploadProgress: config.onUploadProgress,
  });

  const antwoord = wachtrij.shift() ?? standaardAntwoord;

  if (antwoord.soort === 'netwerkfout') {
    return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {}));
  }
  if (antwoord.soort === 'onderbroken') {
    return Promise.reject(new AxiosError('timeout of 15000ms exceeded', AxiosError.ECONNABORTED, config, {}));
  }

  const respons: AxiosResponse = {
    data: antwoord.data,
    status: antwoord.status,
    statusText: '',
    // Een echte adapter leest de kopregels uit de rauwe tekst van het antwoord;
    // axios zet de namen daarbij om naar kleine letters. Code die
    // response.headers['content-disposition'] leest werkt daardoor in de
    // praktijk wél.
    //
    // AxiosHeaders.from() met een object doet dat NIET: die bewaart de naam
    // zoals hij binnenkomt, dus 'Content-Disposition' blijft staan en
    // bracketnotatie met kleine letters levert undefined op. Vandaar dat we de
    // namen hier zelf eerst omzetten - anders zou een test falen op iets wat in
    // de browser gewoon werkt.
    headers: AxiosHeaders.from(
      Object.fromEntries(Object.entries(antwoord.headers).map(([naam, waarde]) => [naam.toLowerCase(), waarde])),
    ),
    config,
  };

  // settle() in axios beslist aan de hand van validateStatus of dit een
  // afwijzing wordt; zo krijgen we een echte AxiosError met response erin, en
  // loopt de foutafhandelaar van de response-interceptor er echt doorheen.
  if (config.validateStatus && !config.validateStatus(antwoord.status)) {
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${antwoord.status}`,
        antwoord.status >= 400 && antwoord.status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
        config,
        {},
        respons,
      ),
    );
  }
  return Promise.resolve(respons);
};

/** Hang de nepserver eronder. Aanroepen in beforeEach. */
export function startNepserver(): void {
  if (!adapterBewaard) {
    origineleAdapter = api.defaults.adapter;
    adapterBewaard = true;
  }
  api.defaults.adapter = adapter;
  verzoeken.length = 0;
  wachtrij.length = 0;
  standaardAntwoord = { soort: 'gelukt', status: 200, data: {}, headers: {} };
}

/** Zet de echte adapter terug. Aanroepen in afterEach. */
export function stopNepserver(): void {
  if (adapterBewaard) {
    api.defaults.adapter = origineleAdapter;
  }
}

/** Zet het volgende antwoord klaar (in volgorde van aanroep). */
export function antwoordMet(data: unknown, opties: { status?: number; headers?: Record<string, string> } = {}): void {
  wachtrij.push({
    soort: 'gelukt',
    status: opties.status ?? 200,
    data,
    headers: opties.headers ?? {},
  });
}

/** Zet een foutantwoord klaar, zoals de server dat zou geven. */
export function antwoordMetFout(status: number, data: unknown = { error: 'Er ging iets mis.' }): void {
  wachtrij.push({ soort: 'gelukt', status, data, headers: {} });
}

/** Het verzoek komt de server niet eens uit: geen respons, wel een fout. */
export function antwoordMetNetwerkfout(): void {
  wachtrij.push({ soort: 'netwerkfout' });
}

/** Het verzoek loopt in de tijdslimiet van de client (15 seconden). */
export function antwoordMetTijdslimiet(): void {
  wachtrij.push({ soort: 'onderbroken' });
}

/** Het laatst onderschepte verzoek. Faalt hard als er niets verstuurd is. */
export function laatsteVerzoek(): Verzoek {
  const verzoek = verzoeken[verzoeken.length - 1];
  if (!verzoek) throw new Error('Er is geen verzoek verstuurd.');
  return verzoek;
}

/** Alle onderschepte verzoeken, in volgorde. */
export function alleVerzoeken(): Verzoek[] {
  return verzoeken;
}
