/**
 * Het controlepatroon van een eigen veld komt van een beheerder en wordt
 * getoetst aan invoer van leden. Een patroon dat exponentieel terugzoekt mag
 * het proces niet stilzetten: het toetsen heeft een tijdsbudget, en bij het
 * opslaan wordt een ongeldig of absurd lang patroon geweigerd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import customFieldsRoutes from '../../routes/custom-fields';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestUser } from '../testUtils';
import { toetsPatroon, MAX_PATROON_LENGTE } from '../../utils/veiligeRegex';

const app = express();
app.use(express.json());
app.use('/api/custom-fields', customFieldsRoutes);
app.use(errorHandler);

// Klassiek voorbeeld van catastrofaal terugzoeken: zonder tijdsbudget kost
// deze invoer seconden rekentijd waarin het proces niets anders doet.
const CATASTROFAAL = '^(a+)+$';
const KWAADAARDIGE_INVOER = 'a'.repeat(28) + '!';

describe('het controlepatroon van een eigen veld', () => {
  let beheerderToken: string;
  let lid: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
  });

  const maakVeld = (validationRegex: string) =>
    request(app)
      .post('/api/custom-fields/definitions')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ entityType: 'user', fieldKey: 'lidnummer', fieldLabel: 'Lidnummer', fieldType: 'text', validationRegex });

  const zetWaarde = (waarde: string) =>
    request(app)
      .post('/api/custom-fields/values')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ entityType: 'user', entityId: lid.id, values: { lidnummer: waarde } });

  it('breekt een catastrofaal patroon af binnen het tijdsbudget en weigert de waarde', async () => {
    expect((await maakVeld(CATASTROFAAL)).status).toBe(201);

    const begin = Date.now();
    const antwoord = await zetWaarde(KWAADAARDIGE_INVOER);
    const duur = Date.now() - begin;

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.error).toContain('kon niet worden gecontroleerd');
    expect(duur).toBeLessThan(1000);
  });

  it('toetst een gewone waarde aan hetzelfde patroon nog gewoon', async () => {
    expect((await maakVeld(CATASTROFAAL)).status).toBe(201);
    expect((await zetWaarde('aaaa')).status).toBe(200);
    expect((await zetWaarde('aab')).status).toBe(400);
  });

  it('weigert een ongeldig patroon bij het opslaan', async () => {
    const antwoord = await maakVeld('^(L-\\d{4}$');
    expect(antwoord.status).toBe(400);
  });

  it('weigert een patroon dat langer is dan de grens', async () => {
    const antwoord = await maakVeld('a'.repeat(MAX_PATROON_LENGTE + 1));
    expect(antwoord.status).toBe(400);
  });

  it('geeft bij toetsen buiten de route dezelfde drie uitkomsten', () => {
    expect(toetsPatroon('^L-\\d{4}$', 'L-0042')).toBe('past');
    expect(toetsPatroon('^L-\\d{4}$', 'onzin')).toBe('past-niet');
    expect(toetsPatroon('(', 'x')).toBe('onbeslist');
    expect(toetsPatroon(CATASTROFAAL, KWAADAARDIGE_INVOER, 20)).toBe('onbeslist');
  });
});
