/**
 * Testhulp: laat een nep-`fetch` antwoorden voor de gedeelde api-client.
 *
 * Tests die eerst `fetch` afvingen, kunnen zo blijven schrijven wat ze al
 * schreven - een functie die per adres een antwoord geeft - terwijl de code
 * nu via client.ts gaat. Het verzoek loopt door de echte interceptors (token,
 * 401) en wordt pas bij de adapter onderschept.
 */

import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios';
import api from '../client';

export interface NepVerzoekOpties {
  method: string;
  body: unknown;
  headers: Record<string, unknown>;
}

export interface NepAntwoord {
  ok: boolean;
  status?: number;
  statusText: string;
  json: () => Promise<unknown>;
}

export type NepFetch = (url: string, opties: NepVerzoekOpties) => Promise<NepAntwoord>;

/** Hangt de nep-fetch onder de client en geeft een functie terug die dat ongedaan maakt. */
export function installeerFetchAdapter(nep: NepFetch): () => void {
  const origineel = api.defaults.adapter;
  const adapter: AxiosAdapter = async (config) => {
    const opties: NepVerzoekOpties = {
      method: (config.method ?? 'get').toUpperCase(),
      body: config.data,
      headers: AxiosHeaders.from(config.headers).toJSON(),
    };
    let antwoord: NepAntwoord;
    try {
      antwoord = await nep(api.getUri(config), opties);
    } catch (fout) {
      throw new AxiosError((fout as Error).message, AxiosError.ERR_NETWORK, config);
    }
    const status = antwoord.status ?? (antwoord.ok ? 200 : 500);
    const response = { data: await antwoord.json(), status, statusText: antwoord.statusText, headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        null,
        response,
      );
    }
    return response;
  };
  api.defaults.adapter = adapter;
  return () => {
    api.defaults.adapter = origineel;
  };
}
