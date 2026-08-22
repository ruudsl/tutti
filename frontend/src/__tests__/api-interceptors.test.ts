/**
 * Tests voor de axios-instantie van src/api.ts en zijn twee interceptors
 * (regel 58 tot en met 87).
 *
 * Dit is het enige stuk van het bestand dat echt iets beslist. De rest zet een
 * pad in elkaar en geeft response.data terug; hier wordt bepaald of iemand
 * ingelogd blijft. Een fout in deze twintig regels gooit een gebruiker midden
 * in zijn werk terug naar het inlogscherm, of laat juist een verlopen sessie
 * stilzwijgend doorlopen.
 *
 * De uitzondering voor /auth/login is het gevoeligste geval: zonder die
 * uitzondering leidt een verkeerd wachtwoord tot een doorverwijzing naar
 * /login, waardoor de melding "onjuiste inloggegevens" nooit in beeld komt en
 * de gebruiker alleen ziet dat het formulier zichzelf leegmaakt.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
} from './nepserver-api';
import api, { login, getProfile, getUsers, changePassword, getMp3Url } from '../api';

/**
 * jsdom laat geen echte navigatie toe, dus window.location wordt per test
 * vervangen door een schrijfbaar object. Zo kunnen we zien of de interceptor
 * href heeft gezet zonder dat jsdom "Not implemented: navigation" gaat roepen.
 */
let echteLocatie: Location;

beforeEach(() => {
  startNepserver();
  localStorage.clear();
  echteLocatie = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '' },
  });
});

afterEach(() => {
  stopNepserver();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: echteLocatie,
  });
  localStorage.clear();
});

describe('instelling van de instantie', () => {
  it('praat met /api en breekt af na vijftien seconden', async () => {
    // Zonder tijdslimiet blijft een verzoek naar een server die niet antwoordt
    // hangen, en blijft het scherm in de laadtoestand staan.
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.timeout).toBe(15000);

    antwoordMet({});
    await getProfile();
    expect(laatsteVerzoek().timeout).toBe(15000);
    expect(laatsteVerzoek().uri).toBe('/api/auth/me');
  });
});

describe('de request-interceptor plakt het token eraan', () => {
  it('zet Authorization als er een token in localStorage staat', async () => {
    localStorage.setItem('token', 'jwt-van-de-server');
    antwoordMet({});
    await getProfile();

    expect(laatsteVerzoek().headers.Authorization).toBe('Bearer jwt-van-de-server');
  });

  it('laat de kopregel weg als er geen token is', async () => {
    antwoordMet({});
    await getProfile();

    expect(laatsteVerzoek().headers.Authorization).toBeUndefined();
  });

  it('leest het token bij elk verzoek opnieuw', async () => {
    // Belangrijk na inloggen: het eerste verzoek na login moet het verse token
    // meesturen, niet een waarde die bij het laden van de module is gelezen.
    antwoordMet({});
    await getProfile();
    expect(laatsteVerzoek().headers.Authorization).toBeUndefined();

    localStorage.setItem('token', 'vers-token');
    antwoordMet({});
    await getProfile();
    expect(laatsteVerzoek().headers.Authorization).toBe('Bearer vers-token');
  });

  it('stuurt een leeg token niet mee', async () => {
    // localStorage geeft een lege string terug als iemand hem zo heeft gezet;
    // 'Bearer ' zonder token levert aan de serverkant alleen ruis op.
    localStorage.setItem('token', '');
    antwoordMet({});
    await getProfile();

    expect(laatsteVerzoek().headers.Authorization).toBeUndefined();
  });
});

describe('de response-interceptor bij een 401', () => {
  it('gooit het token en de gebruiker weg en stuurt door naar /login', async () => {
    localStorage.setItem('token', 'verlopen-token');
    localStorage.setItem('user', '{"id":"u1"}');
    antwoordMetFout(401, { error: 'Token expired' });

    await expect(getProfile()).rejects.toMatchObject({ response: { status: 401 } });

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('geeft de fout ook na het uitloggen door, zodat de aanroeper hem ziet', async () => {
    localStorage.setItem('token', 'verlopen-token');
    antwoordMetFout(401, { error: 'Token expired' });

    await expect(getUsers()).rejects.toMatchObject({
      response: { status: 401, data: { error: 'Token expired' } },
    });
  });

  it('logt NIET uit bij een 401 van /auth/login', async () => {
    // Een 401 van de inlogroute betekent "verkeerd wachtwoord", niet "sessie
    // verlopen". Uitloggen en doorsturen zou de foutmelding wegvagen.
    localStorage.setItem('token', 'nog-geldig-token-van-vorige-sessie');
    localStorage.setItem('user', '{"id":"u1"}');
    antwoordMetFout(401, { error: 'Ongeldige inloggegevens' });

    await expect(login('jan@example.com', 'fout-wachtwoord')).rejects.toMatchObject({
      response: { status: 401, data: { error: 'Ongeldige inloggegevens' } },
    });

    expect(localStorage.getItem('token')).toBe('nog-geldig-token-van-vorige-sessie');
    expect(localStorage.getItem('user')).toBe('{"id":"u1"}');
    expect(window.location.href).toBe('');
  });

  it('logt ook niet uit bij een 401 op de tweede stap van tweefactor', async () => {
    // Dezelfde route, nu mét mfaCode: een verkeerde code hoort de gebruiker op
    // het inlogscherm te zien, niet als sessieverlies.
    localStorage.setItem('token', 'oud');
    antwoordMetFout(401, { error: 'Ongeldige verificatiecode' });

    await expect(login('jan@example.com', 'goed', '000000')).rejects.toBeTruthy();

    expect(localStorage.getItem('token')).toBe('oud');
    expect(window.location.href).toBe('');
  });
});

describe('de response-interceptor bij andere statussen', () => {
  it('logt NIET uit bij een 403', async () => {
    // 403 betekent "je mag dit niet", niet "je bent niet meer ingelogd".
    // Uitloggen zou een lid dat per ongeluk op een beheerderspagina komt uit
    // zijn sessie gooien.
    localStorage.setItem('token', 'geldig-token');
    antwoordMetFout(403, { error: 'Onvoldoende rechten' });

    await expect(getUsers()).rejects.toMatchObject({ response: { status: 403 } });

    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });

  it('logt niet uit bij een 400', async () => {
    localStorage.setItem('token', 'geldig-token');
    antwoordMetFout(400, { error: 'Wachtwoord te kort' });

    await expect(changePassword('oud', 'kort')).rejects.toMatchObject({ response: { status: 400 } });

    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });

  it('logt niet uit bij een 500', async () => {
    localStorage.setItem('token', 'geldig-token');
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getProfile()).rejects.toMatchObject({ response: { status: 500 } });

    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });

  it('logt niet uit bij een netwerkfout zonder respons', async () => {
    // error.response bestaat dan niet. Zou de interceptor daar niet op letten,
    // dan werd elke haperende wifi-verbinding een uitlogactie.
    localStorage.setItem('token', 'geldig-token');
    antwoordMetNetwerkfout();

    await expect(getProfile()).rejects.toMatchObject({ code: 'ERR_NETWORK' });

    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });

  it('logt niet uit als het verzoek in de tijdslimiet loopt', async () => {
    localStorage.setItem('token', 'geldig-token');
    antwoordMetTijdslimiet();

    await expect(getProfile()).rejects.toMatchObject({ code: 'ECONNABORTED' });

    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });

  it('laat een geslaagd antwoord ongemoeid', async () => {
    localStorage.setItem('token', 'geldig-token');
    antwoordMet({ id: 'u1', email: 'jan@example.com' });

    await expect(getProfile()).resolves.toEqual({ id: 'u1', email: 'jan@example.com' });
    expect(localStorage.getItem('token')).toBe('geldig-token');
    expect(window.location.href).toBe('');
  });
});

describe('getMp3Url', () => {
  it('bouwt het adres op met de baseURL van de instantie', () => {
    localStorage.setItem('token', 'jwt-van-de-server');

    expect(getMp3Url('stuk.mp3')).toBe('/api/music-pieces/mp3/stuk.mp3?token=jwt-van-de-server');
  });

  // Vastgelegd, niet goedgekeurd: zonder token komt hier letterlijk
  // "?token=null" uit. De backend krijgt dan de tekst "null" als token
  // aangeboden in plaats van helemaal niets.
  it('zet letterlijk null in het adres als er geen token is', () => {
    expect(getMp3Url('stuk.mp3')).toBe('/api/music-pieces/mp3/stuk.mp3?token=null');
  });
});
