/**
 * Geheimen en e-mailadressen horen niet in het logboek en niet bij Sentry.
 *
 * Er waren vier plekken met elk een eigen lijstje: de foutafhandeling (die
 * wel genest keek), Sentry (alleen het bovenste niveau, vier namen), de
 * aanvraaglogger (idem) en de loggers zelf (niets). Een `clientSecret` in
 * een genest object, een Authorization-kop in de config van een fout of een
 * e-mailadres in een infomelding kwam zo gewoon in het logboek of bij een
 * externe dienst terecht.
 */

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import winston from 'winston';
import '../setup';
import { maskeerGeheimen, maskeerEmail, maskeerVoorLog, MAX_DIEPTE, TE_DIEP } from '../../utils/maskeren';
import { filterSentryGebeurtenis } from '../../monitoring/sentry';
import type { ErrorEvent } from '@sentry/node';

describe('Maskeren op sleutelpatroon', () => {
  it('herkent geheimen aan een deel van de naam, zonder op hoofdletters te letten', () => {
    const uit = maskeerGeheimen({
      smtpPassword: 'a',
      CLIENT_SECRET: 'b',
      bearerToken: 'c',
      privateKey: 'd',
      Iban: 'NL00BANK0123456789',
      Authorization: 'Bearer xyz',
      setCookie: 'sessie=1',
      naam: 'Jan',
    }) as Record<string, unknown>;

    expect(uit.naam).toBe('Jan');
    for (const sleutel of [
      'smtpPassword',
      'CLIENT_SECRET',
      'bearerToken',
      'privateKey',
      'Iban',
      'Authorization',
      'setCookie',
    ]) {
      expect(uit[sleutel]).toBe('[weggelaten]');
    }
  });

  it('kijkt in geneste objecten en in lijsten', () => {
    const uit = maskeerGeheimen({
      koppelingen: [{ naam: 'mollie', instellingen: { mollieApiKey: 'live_x' } }],
      spond: { account: { wachtwoord: 'blijft', password: 'weg' } },
    }) as any;

    expect(uit.koppelingen[0].naam).toBe('mollie');
    expect(uit.koppelingen[0].instellingen.mollieApiKey).toBe('[weggelaten]');
    expect(uit.spond.account.password).toBe('[weggelaten]');
    expect(JSON.stringify(uit)).not.toContain('live_x');
  });

  it('geeft niets door van wat dieper zit dan de grens', () => {
    let diep: Record<string, unknown> = { geheimOpDeBodem: 'zichtbaar?' };
    for (let i = 0; i < MAX_DIEPTE + 3; i++) diep = { laag: diep };

    const tekst = JSON.stringify(maskeerGeheimen(diep));
    expect(tekst).toContain(TE_DIEP);
    expect(tekst).not.toContain('zichtbaar?');
  });

  it('haalt de kopregels uit een fout die de aanvraag meedraagt', () => {
    // Zo ziet een HTTP-fout van een bibliotheek eruit: de aanvraag, met
    // kopregels, hangt als eigen veld aan de fout.
    const fout = Object.assign(new Error('Request failed'), {
      config: { headers: { Authorization: 'Bearer geheim-token' }, url: 'https://api.example.org' },
    });

    const uit = maskeerGeheimen({ error: fout }) as any;

    expect(uit.error.message).toBe('Request failed');
    expect(uit.error.config.url).toBe('https://api.example.org');
    expect(uit.error.config.headers.Authorization).toBe('[weggelaten]');
    expect(JSON.stringify(uit)).not.toContain('geheim-token');
  });
});

describe('E-mailadressen', () => {
  it('kort een adres af tot de eerste letter en het domein', () => {
    expect(maskeerEmail('ruud@example.org')).toBe('r***@example.org');
    expect(maskeerEmail('Lid aangemaakt: jan.jansen+tutti@harmonie.nl.')).toBe('Lid aangemaakt: j***@harmonie.nl.');
  });

  it('laat tekst zonder adres met rust', () => {
    expect(maskeerEmail('Geen adres hier')).toBe('Geen adres hier');
  });

  it('kort adressen af in geneste velden', () => {
    const uit = maskeerVoorLog({ lid: { email: 'piet@example.org' }, ontvangers: ['a@b.nl'] }) as any;
    expect(uit.lid.email).toBe('p***@example.org');
    expect(uit.ontvangers[0]).toBe('a***@b.nl');
  });
});

describe('De loggers', () => {
  // setup.ts vervangt beide loggers door stubs; hier gaat het juist om de
  // echte, met een transport dat de uitvoer opvangt.
  async function vangUitvoer(modulePad: string): Promise<{ logger: winston.Logger; regels: any[] }> {
    const { default: logger } = await vi.importActual<{ default: winston.Logger }>(modulePad);
    const regels: any[] = [];
    const stroom = new Writable({
      write(stuk, _codering, klaar) {
        regels.push(JSON.parse(stuk.toString()));
        klaar();
      },
    });
    logger.add(new winston.transports.Stream({ stream: stroom, format: winston.format.json() }));
    return { logger, regels };
  }

  for (const modulePad of ['../../utils/logger', '../../logging/logger']) {
    describe(modulePad.replace('../../', ''), () => {
      it('kort e-mailadressen af in de melding en in de velden', async () => {
        const { logger, regels } = await vangUitvoer(modulePad);

        logger.info('User onboarded: nieuw.lid@example.org', { email: 'nieuw.lid@example.org', userId: 'u1' });

        const regel = regels.at(-1);
        expect(regel.message).toBe('User onboarded: n***@example.org');
        expect(regel.email).toBe('n***@example.org');
        expect(regel.userId).toBe('u1');
      });

      it('laat geen genest geheim door', async () => {
        const { logger, regels } = await vangUitvoer(modulePad);

        logger.error('Koppeling mislukt', { config: { spond: { password: 'geheim' } }, apiKey: 'sleutel' });

        const regel = regels.at(-1);
        expect(regel.level).toBe('error');
        expect(regel.config.spond.password).toBe('[weggelaten]');
        expect(regel.apiKey).toBe('[weggelaten]');
        expect(JSON.stringify(regel)).not.toContain('geheim"');
      });
    });
  }
});

describe('Sentry', () => {
  it('maskeert geneste geheimen in aanvraag, context en kruimels', () => {
    const gebeurtenis = {
      type: undefined,
      request: {
        headers: { authorization: 'Bearer a', cookie: 'sessie=b', 'user-agent': 'test' },
        data: { spond: { password: 'c' }, email: 'lid@example.org' },
      },
      extra: { koppeling: { clientSecret: 'd' } },
      contexts: { additional: { tokens: ['e'] } },
      breadcrumbs: [{ message: 'mail naar lid@example.org', data: { refreshToken: 'f' } }],
      user: { id: 'u1', email: 'lid@example.org' },
    } as unknown as ErrorEvent;

    const uit = filterSentryGebeurtenis(gebeurtenis);
    const tekst = JSON.stringify(uit);

    for (const geheim of ['Bearer a', 'sessie=b', '"c"', '"d"', '"e"', '"f"', 'lid@example.org']) {
      expect(tekst).not.toContain(geheim);
    }
    expect(uit.request!.headers!['user-agent']).toBe('test');
    expect(uit.user!.email).toBe('l***@example.org');
  });

  it('stuurt een aanvraag als tekst die geen JSON is niet mee, en gooit niet', () => {
    const gebeurtenis = { type: undefined, request: { data: 'password=geheim&naam=jan' } } as unknown as ErrorEvent;

    const uit = filterSentryGebeurtenis(gebeurtenis);

    expect(uit.request!.data).toBe('[weggelaten]');
  });

  it('maskeert een aanvraag als JSON-tekst ook genest', () => {
    const gebeurtenis = {
      type: undefined,
      request: { data: JSON.stringify({ config: { secret: 'geheim' } }) },
    } as unknown as ErrorEvent;

    const uit = filterSentryGebeurtenis(gebeurtenis);

    expect(JSON.parse(uit.request!.data as string).config.secret).toBe('[weggelaten]');
  });
});
