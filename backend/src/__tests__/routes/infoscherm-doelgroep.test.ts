/**
 * Het infoscherm toont alleen berichten zonder doelgroep.
 *
 * Het scherm in de hal is zonder aanmelding op te vragen, met
 * Access-Control-Allow-Origin: *. Het toonde het nieuwste vastgezette bericht,
 * ook als dat alleen voor het bestuur of voor één orkest bedoeld was. In de app
 * ziet alleen die doelgroep zo'n bericht (canUserSeePost in posts.ts); via het
 * infoscherm kon iedereen het lezen die de slug van de vereniging kende.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import calendarRoutes from '../../routes/calendar';
import { errorHandler } from '../../middleware/errorHandler';
import { setModuleEnabled, clearModuleCache } from '../../modules/service';
import { createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/calendar', calendarRoutes);
app.use(errorHandler);

describe('infoscherm en de doelgroep van een bericht', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    clearModuleCache();
    setModuleEnabled(vereniging.id, 'posts', true, beheerder.id);
  });

  function maakBericht(
    titel: string,
    doelgroep: { rollen?: string | null; orkesten?: string | null },
    gepubliceerd: string,
  ): void {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO posts (id, association_id, slug, title, content, status, is_pinned, target_roles, target_orchestras, published_at, created_by)
       VALUES (?, ?, ?, ?, 'Inhoud', 'published', 1, ?, ?, ?, ?)`,
    ).run(
      id,
      vereniging.id,
      `bericht-${id}`,
      titel,
      doelgroep.rollen ?? null,
      doelgroep.orkesten ?? null,
      gepubliceerd,
      beheerder.id,
    );
  }

  const haalScherm = () => request(app).get(`/api/calendar/info-screen/${vereniging.id}`);

  it('toont geen vastgezet bericht dat alleen voor bepaalde rollen is', async () => {
    maakBericht('Alleen voor het bestuur', { rollen: JSON.stringify(['admin']) }, '2026-01-01');

    const antwoord = await haalScherm();
    expect(antwoord.status).toBe(200);
    expect(antwoord.body.announcement).toBeNull();
  });

  it('toont geen vastgezet bericht dat alleen voor een orkest is', async () => {
    maakBericht('Alleen voor het A-orkest', { orkesten: JSON.stringify([uuidv4()]) }, '2026-01-01');

    const antwoord = await haalScherm();
    expect(antwoord.body.announcement).toBeNull();
  });

  it('valt terug op het nieuwste bericht zonder doelgroep', async () => {
    maakBericht('Voor iedereen', {}, '2026-01-01');
    maakBericht('Alleen voor het bestuur', { rollen: JSON.stringify(['admin']) }, '2026-02-01');

    const antwoord = await haalScherm();
    expect(antwoord.body.announcement).toMatchObject({ title: 'Voor iedereen' });
  });

  it('ziet een lege doelgroeplijst als iedereen', async () => {
    // posts.ts slaat een meegestuurde lege lijst op als '[]', en
    // canUserSeePost leest die als: geen beperking.
    maakBericht('Lege lijsten', { rollen: '[]', orkesten: '[]' }, '2026-01-01');

    const antwoord = await haalScherm();
    expect(antwoord.body.announcement).toMatchObject({ title: 'Lege lijsten' });
  });
});
