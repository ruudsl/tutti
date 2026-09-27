/**
 * De controle op het opslagquotum vóór multer.
 *
 * multer schrijft een bestand weg voordat de handler draait. Wat al aan de
 * opgegeven lengte van het verzoek te zien is, wordt daarom vóór multer
 * geweigerd: dan komt er niets op schijf. Wat binnen de marge voor de
 * multipart-omhulling valt, of geen lengte opgeeft, gaat door naar de
 * controle na multer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';
import '../setup';
import db from '../../database/connection';
import { bewaakOpslagVooraf, MULTIPART_MARGE } from '../../middleware/opslagquotum';
import { ApiError } from '../../middleware/errorHandler';
import type { AuthRequest } from '../../middleware/auth';
import { createTestAssociation, createTestMusicPiece, TestAssociation } from '../testUtils';

const eerder = process.env.STORAGE_QUOTA_BYTES;
let vereniging: TestAssociation;

beforeEach(() => {
  vereniging = createTestAssociation();
  process.env.STORAGE_QUOTA_BYTES = '10000';
});

afterEach(() => {
  if (eerder === undefined) delete process.env.STORAGE_QUOTA_BYTES;
  else process.env.STORAGE_QUOTA_BYTES = eerder;
});

function verzoek(lengte: string | undefined): AuthRequest {
  return {
    headers: lengte === undefined ? {} : { 'content-length': lengte },
    user: { id: 'u', associationId: vereniging.id, role: 'admin' },
  } as unknown as AuthRequest;
}

function draai(req: AuthRequest, vrijkomend?: () => number) {
  const res = { setHeader: vi.fn() } as unknown as Response;
  const next = vi.fn();
  bewaakOpslagVooraf(vrijkomend)(req, res, next);
  return { res, next, fout: next.mock.calls[0]?.[0] as unknown };
}

describe('opslagquotum vóór multer', () => {
  it('weigert met 413 wat al aan de opgegeven lengte te zien is, en sluit de verbinding', () => {
    const { res, fout } = draai(verzoek(String(MULTIPART_MARGE + 10_001)));

    expect(fout).toBeInstanceOf(ApiError);
    expect((fout as ApiError).statusCode).toBe(413);
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'close');
  });

  it('laat door wat binnen de marge voor de omhulling valt', () => {
    const { next } = draai(verzoek(String(MULTIPART_MARGE + 10_000)));
    expect(next).toHaveBeenCalledWith();
  });

  it('laat een verzoek zonder lengte door naar de controle na multer', () => {
    const { next } = draai(verzoek(undefined));
    expect(next).toHaveBeenCalledWith();
  });

  it('rekent met wat de upload vervangt', () => {
    const stuk = createTestMusicPiece(vereniging.id);
    db.prepare('UPDATE music_pieces SET file_size = 9000 WHERE id = ?').run(stuk.id);
    const lengte = String(MULTIPART_MARGE + 5000);

    expect(draai(verzoek(lengte)).fout).toBeInstanceOf(ApiError);
    expect(draai(verzoek(lengte), () => 4000).next).toHaveBeenCalledWith();
  });
});
