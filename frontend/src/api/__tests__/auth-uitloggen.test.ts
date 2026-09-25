/**
 * Tests voor het uitloggen in de api-laag.
 *
 * Het token moet expliciet mee. AuthContext wist het direct na de aanroep uit
 * localStorage, en de interceptor in client.ts leest localStorage pas op het
 * moment dat het verzoek vertrekt - dan is het er al niet meer. Zonder
 * expliciete kopregel zou het verzoek zonder token gaan en trok de server
 * niets in.
 *
 * De route is vergeleken met backend/src/routes/auth.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import { logout } from '../auth';

beforeEach(() => {
  startNepserver();
  localStorage.clear();
});
afterEach(() => stopNepserver());

describe('logout', () => {
  it('stuurt het meegegeven token mee, ook als localStorage al leeg is', async () => {
    await logout('het-token');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/auth/logout');
    expect(laatsteVerzoek().headers.Authorization).toBe('Bearer het-token');
  });

  it('gebruikt een route die de server aanbiedt', () => {
    expect(serverBiedtAan(serverroutes('auth.ts'), '/auth', 'post', '/auth/logout')).toBe(true);
  });
});
