/**
 * Het opslagquotum van een vereniging bewaken bij een upload.
 *
 * multer schrijft een bestand naar schijf vóórdat de handler draait. Om te
 * weigeren vóór er iets wordt opgeslagen, kijkt `bewaakOpslagVooraf` - vóór
 * multer in de keten - naar de opgegeven lengte van het verzoek
 * (`Content-Length`). Node leest nooit meer dan die lengte, dus een te kleine
 * opgave levert geen groter bestand op. Een verzoek zonder lengte (chunked)
 * komt erdoor; dan vangt `bewaakOpslagNaUpload` het, met de werkelijke
 * grootte uit multer, en ruimt de al weggeschreven bestanden weer op.
 *
 * De grens zelf en het tellen staan in services/abonnementLimieten.ts.
 */

import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { bewaakOpslag } from '../services/abonnementLimieten';
import logger from '../utils/logger';

/**
 * Ruimte voor de multipart-omhulling om de bestanden heen: grenzen, kopregels
 * per deel en tekstvelden. Zonder die marge zou een bestand dat nét past
 * vooraf al worden geweigerd; de precieze controle volgt na multer.
 */
export const MULTIPART_MARGE = 64 * 1024;

/**
 * Middleware vóór multer: weiger met 413 als de opgegeven lengte van het
 * verzoek al niet meer past.
 *
 * @param vrijkomend wat deze upload vervangt (een oude mp3), zodat het
 *   vervangen van een bestand vlak onder de grens niet vooraf misgaat.
 */
export function bewaakOpslagVooraf(vrijkomend?: (req: AuthRequest) => number) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const lengte = Number(req.headers['content-length']);
    if (!req.user?.associationId || !Number.isFinite(lengte) || lengte <= 0) {
      next();
      return;
    }
    try {
      bewaakOpslag(req.user.associationId, Math.max(0, lengte - MULTIPART_MARGE), vrijkomend?.(req) ?? 0);
      next();
    } catch (fout) {
      // De rest van het verzoek wordt niet meer gelezen; de verbinding sluiten
      // voorkomt dat die bytes aan een volgend verzoek blijven hangen.
      res.setHeader('Connection', 'close');
      next(fout);
    }
  };
}

/** De bestanden die multer voor dit verzoek heeft weggeschreven. */
export function geuploadeBestanden(req: AuthRequest): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
}

/**
 * Na multer: weiger met 413 als de werkelijke bestanden niet passen, en haal
 * ze dan eerst weer van schijf.
 *
 * @param bestanden standaard alles wat multer voor dit verzoek schreef.
 * @param vrijkomend wat deze upload vervangt.
 */
export async function bewaakOpslagNaUpload(
  req: AuthRequest,
  bestanden: Express.Multer.File[] = geuploadeBestanden(req),
  vrijkomend = 0,
): Promise<void> {
  const bytes = bestanden.reduce((som, bestand) => som + bestand.size, 0);
  try {
    bewaakOpslag(req.user?.associationId ?? null, bytes, vrijkomend);
  } catch (fout) {
    await Promise.all(
      bestanden
        .filter((bestand) => bestand.path)
        .map((bestand) =>
          fs.promises.unlink(bestand.path).catch((err: Error) => {
            logger.error(`Geweigerde upload niet op te ruimen: ${bestand.path}`, { error: err.message });
          }),
        ),
    );
    throw fout;
  }
}
