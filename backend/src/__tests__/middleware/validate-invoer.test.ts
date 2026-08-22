/**
 * validate() is klein maar staat voor zo'n beetje elke schrijvende route. Als
 * hij iets doorlaat, dan doet hij dat overal.
 *
 * Twee dingen zijn hier belangrijker dan "geldige invoer komt door":
 *
 *  1. Bij een fout schrijft validate zelf geen antwoord maar geeft hij de
 *     ZodError door aan next(). Loopt de errorHandler niet mee, dan blijft een
 *     verzoek hangen in plaats van een 400 te geven - dat is hier vastgelegd.
 *  2. De foutmelding gaat naar de client. Die mag het veld noemen dat fout is,
 *     maar niet de waarde die is ingestuurd; anders staat een verkeerd getikt
 *     wachtwoord in de foutmelding (en daarmee in de logs van de browser).
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { errorHandler } from '../../middleware/errorHandler';

const ledenSchema = z.object({
  naam: z.string().min(2),
  leeftijd: z.number().int().positive(),
  rol: z.string().optional().default('lid'),
});

/** App met body-parser, validatie en de centrale foutafhandeling erachter. */
function maakApp(middleware: express.RequestHandler, methode: 'post' | 'get' = 'post', pad = '/leden') {
  const app = express();
  app.use(express.json());
  const handler = vi.fn((req: express.Request, res: express.Response) => {
    res.json({ ontvangen: req.body, query: req.query, params: req.params });
  });
  app[methode](pad, middleware, handler);
  app.use(errorHandler);
  return { app, handler };
}

describe('een geldige body', () => {
  it('komt door en bereikt de handler', async () => {
    const { app, handler } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({ naam: 'Anna', leeftijd: 34 });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('vervangt req.body door de geparste waarde, inclusief ingevulde standaarden', async () => {
    const { app } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({ naam: 'Anna', leeftijd: 34 });

    expect(res.body.ontvangen).toEqual({ naam: 'Anna', leeftijd: 34, rol: 'lid' });
  });

  it('gooit velden weg die niet in het schema staan', async () => {
    // Dit is de reden dat req.body wordt vervángen en niet aangevuld: een veld
    // als isAdmin dat niemand heeft gevraagd, mag de handler niet bereiken.
    const { app } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({ naam: 'Anna', leeftijd: 34, isAdmin: true });

    expect(res.body.ontvangen).not.toHaveProperty('isAdmin');
  });

  it('laat een omzetting uit het schema in req.body landen', async () => {
    const schema = z.object({ naam: z.string().transform((s) => s.trim().toUpperCase()) });
    const { app } = maakApp(validate(schema));

    const res = await request(app).post('/leden').send({ naam: '  anna  ' });

    expect(res.body.ontvangen).toEqual({ naam: 'ANNA' });
  });

  it('vervuilt het prototype niet met een __proto__ in de body', async () => {
    const { app } = maakApp(validate(ledenSchema));

    await request(app)
      .post('/leden')
      .set('Content-Type', 'application/json')
      .send('{"naam":"Anna","leeftijd":34,"__proto__":{"besmet":true}}');

    expect(({} as Record<string, unknown>).besmet).toBeUndefined();
  });
});

describe('een ongeldige body', () => {
  it('geeft 400 met een validatiefout', async () => {
    const { app } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({ naam: 'A', leeftijd: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validatiefout.');
  });

  it('bereikt de handler niet', async () => {
    const { app, handler } = maakApp(validate(ledenSchema));

    await request(app).post('/leden').send({ naam: 'A', leeftijd: -1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('noemt elk fout veld apart', async () => {
    const { app } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({ naam: 'A', leeftijd: -1 });

    const paden = (res.body.details as { path: string[] }[]).map((d) => d.path.join('.'));
    expect(paden).toContain('naam');
    expect(paden).toContain('leeftijd');
  });

  it('verklapt de ingestuurde waarde niet in de foutmelding', async () => {
    // De melding gaat terug naar de browser en belandt vaak in een logregel of
    // een foutmeldingsdienst. Het veld benoemen is nodig om de gebruiker te
    // helpen; de inhoud niet.
    const schema = z.object({ wachtwoord: z.string().min(20) });
    const { app } = maakApp(validate(schema));

    const res = await request(app).post('/leden').send({ wachtwoord: 'MijnGeheim2026!' });

    expect(res.status).toBe(400);
    const tekst = JSON.stringify(res.body);
    expect(tekst).not.toContain('MijnGeheim2026!');
    expect(tekst).toContain('wachtwoord');
  });

  it('geeft de ZodError door aan next in plaats van zelf te antwoorden', async () => {
    // Zonder deze eigenschap zou validate op elke route een eigen foutformaat
    // opleveren. Hier vangen we de fout op vóór de errorHandler en kijken wat
    // er precies langskomt.
    let gevangen: unknown = null;
    const app = express();
    app.use(express.json());
    app.post('/leden', validate(ledenSchema), (_req, res) => res.json({ ok: true }));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      gevangen = err;
      res.status(418).json({ naam: err.name });
    });

    const res = await request(app).post('/leden').send({ naam: 'A', leeftijd: -1 });

    expect(res.status).toBe(418);
    expect((gevangen as Error).name).toBe('ZodError');
  });
});

describe('een ontbrekende body', () => {
  it('geeft 400 en niet 500 wanneer er helemaal geen body is', async () => {
    // Zonder body-parser is req.body undefined. Een schema dat een object
    // verwacht hoort dat als een validatiefout te zien, niet als een crash.
    const app = express();
    app.post('/leden', validate(ledenSchema), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app).post('/leden');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validatiefout.');
  });

  it('geeft 400 bij een lege body met een schema dat velden eist', async () => {
    const { app } = maakApp(validate(ledenSchema));

    const res = await request(app).post('/leden').send({});

    expect(res.status).toBe(400);
  });

  it('laat een lege body door wanneer het schema niets eist', async () => {
    const { app } = maakApp(validate(z.object({ notitie: z.string().optional() })));

    const res = await request(app).post('/leden').send({});

    expect(res.status).toBe(200);
    expect(res.body.ontvangen).toEqual({});
  });
});

describe('validatie van de querystring', () => {
  const querySchema = z.object({
    pagina: z.coerce.number().int().min(1).default(1),
    zoek: z.string().optional(),
  });

  it('zet de geparste waarden in req.query', async () => {
    const { app } = maakApp(validate(querySchema, 'query'), 'get');

    const res = await request(app).get('/leden?pagina=3&zoek=anna');

    expect(res.body.query.pagina).toBe(3);
    expect(res.body.query.zoek).toBe('anna');
  });

  it('geeft 400 bij een ongeldige querywaarde', async () => {
    const { app } = maakApp(validate(querySchema, 'query'), 'get');

    const res = await request(app).get('/leden?pagina=0');

    expect(res.status).toBe(400);
  });

  it('BEVINDING: onbekende queryvelden blijven staan na validatie', async () => {
    // Voor de body wordt req.body vervángen, dus daar verdwijnt onbekende
    // invoer. Voor query en params gebruikt validate Object.assign - dat vult
    // aan en verwijdert niets. Een handler die req.query.orderBy leest krijgt
    // dus gewoon wat de aanvrager stuurde, terwijl het schema de indruk wekt
    // dat de invoer is afgebakend.
    //
    // Niet gerepareerd: keys weggooien uit req.query is een gedragswijziging
    // die elke route raakt die een parameter leest die niet in zijn schema
    // staat, en dat valt buiten deze opdracht na te lopen. De regel is dus:
    // wat je uit req.query leest, moet in het schema staan.
    const { app } = maakApp(validate(querySchema, 'query'), 'get');

    const res = await request(app).get('/leden?pagina=2&orderBy=wachtwoord');

    expect(res.body.query.orderBy).toBe('wachtwoord');
  });
});

describe('validatie van routeparameters', () => {
  const paramSchema = z.object({ id: z.string().uuid() });

  it('laat een geldige parameter door', async () => {
    const { app } = maakApp(validate(paramSchema, 'params'), 'get', '/leden/:id');

    const res = await request(app).get('/leden/3f2504e0-4f89-11d3-9a0c-0305e82c3301');

    expect(res.status).toBe(200);
    expect(res.body.params.id).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  });

  it('geeft 400 bij een parameter die niet aan het schema voldoet', async () => {
    const { app, handler } = maakApp(validate(paramSchema, 'params'), 'get', '/leden/:id');

    const res = await request(app).get('/leden/1%20OR%201=1');

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
});
