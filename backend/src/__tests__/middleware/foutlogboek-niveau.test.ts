/**
 * Op welk niveau de foutafhandeling een fout in het logboek zet.
 *
 * Elke fout kwam als `error` met stacktrace en aanvraag in het logboek, ook
 * een verkeerd wachtwoord of een kortingscode die al gebruikt was. Wie het
 * logboek leest of er een melding op zet, zag zo bij elke typfout een crash.
 *
 * Nu: een fout van de aanvrager (ApiError onder de 500, een ongeldig
 * formulier, een geweigerd bestand) is een waarschuwing zonder stacktrace of
 * aanvraag. Een fout van de server blijft `error`, met alles erbij.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import logger from '../../utils/logger';
import { ApiError, errorHandler } from '../../middleware/errorHandler';
import { FileValidationError } from '../../utils/errors';

function aanvraag(): Request {
  return { method: 'POST', path: '/api/auth/login', body: { email: 'a@b.nl', password: 'geheim' } } as Request;
}

function antwoord() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('het logniveau van een fout', () => {
  it('zet een fout van de aanvrager als waarschuwing neer, zonder stacktrace of aanvraag', () => {
    const waarschuw = vi.spyOn(logger, 'warn').mockReturnValue(logger);
    const fout = vi.spyOn(logger, 'error').mockReturnValue(logger);
    const res = antwoord();

    errorHandler(new ApiError(401, 'Ongeldige inloggegevens.'), aanvraag(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(fout).not.toHaveBeenCalled();
    expect(waarschuw).toHaveBeenCalledTimes(1);
    expect(waarschuw.mock.calls[0]).toHaveLength(1);
    expect(String(waarschuw.mock.calls[0][0])).toContain('Ongeldige inloggegevens.');
  });

  it('doet dat ook bij een ongeldig formulier en een geweigerd bestand', () => {
    const waarschuw = vi.spyOn(logger, 'warn').mockReturnValue(logger);
    const fout = vi.spyOn(logger, 'error').mockReturnValue(logger);
    const zodFout = z.object({ naam: z.string() }).safeParse({}).error!;

    errorHandler(zodFout, aanvraag(), antwoord(), vi.fn());
    errorHandler(new FileValidationError('Alleen PDF bestanden zijn toegestaan.'), aanvraag(), antwoord(), vi.fn());

    expect(fout).not.toHaveBeenCalled();
    expect(waarschuw).toHaveBeenCalledTimes(2);
  });

  it('houdt een fout van de server op error, met stacktrace', () => {
    const fout = vi.spyOn(logger, 'error').mockReturnValue(logger);
    const res = antwoord();

    errorHandler(new Error('database weg'), aanvraag(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(fout).toHaveBeenCalledTimes(1);
    expect(fout.mock.calls[0][1]).toEqual(expect.objectContaining({ stack: expect.any(String) }));
  });

  it('houdt ook een ApiError van 500 en hoger op error', () => {
    const fout = vi.spyOn(logger, 'error').mockReturnValue(logger);

    errorHandler(new ApiError(503, 'Even niet'), aanvraag(), antwoord(), vi.fn());

    expect(fout).toHaveBeenCalledTimes(1);
  });

  it('houdt een databasefout die als 409 eindigt op error: die wijst op een gat in een route', () => {
    const fout = vi.spyOn(logger, 'error').mockReturnValue(logger);
    const res = antwoord();

    errorHandler(new Error('UNIQUE constraint failed: users.email'), aanvraag(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(fout).toHaveBeenCalledTimes(1);
  });
});
