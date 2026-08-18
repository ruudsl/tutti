/**
 * Blokkeer een route wanneer de bijbehorende module uit staat.
 *
 * Het antwoord is bewust 404 en niet 403. Een uitgezette module hoort niet te
 * bestaan voor deze vereniging; een 403 zou verklappen dat de functionaliteit
 * er wel is en alleen op slot zit. Dat past niet bij "verbergen".
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { isModuleEnabled } from '../modules/service';

export function requireModule(key: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // Zonder ingelogde gebruiker weten we de vereniging niet. De
    // authenticatie-middleware verderop in de keten handelt dat af.
    if (req.user && !isModuleEnabled(req.user.associationId, key)) {
      res.status(404).json({ error: 'Niet gevonden.' });
      return;
    }
    next();
  };
}
