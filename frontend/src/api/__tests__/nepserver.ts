/**
 * Nepserver voor de api-tests.
 *
 * In plaats van `fetch` te vervangen hangen we een eigen adapter onder de
 * gedeelde axios-instantie uit client.ts. Dat is bewust: axios bouwt zelf het
 * volledige adres (baseURL + pad + queryreeks) en zet de body om naar JSON.
 * Door pas op adapterniveau te onderscheppen testen we wat er echt over de
 * lijn zou gaan, inclusief de codering van zoektermen, en niet alleen welke
 * argumenten aan `api.get` zijn meegegeven.
 */

import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import api from '../client';

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
    // Echte adapters halen de kopregels door AxiosHeaders heen, waardoor ze
    // altijd in kleine letters te lezen zijn. Dat na-apen we hier, anders zou
    // een test met 'Content-Disposition' slagen waar de praktijk faalt.
    headers: AxiosHeaders.from(antwoord.headers),
    config,
  };

  // settle() in axios beslist aan de hand van validateStatus of dit een
  // afwijzing wordt; zo krijgen we een echte AxiosError met response erin.
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
