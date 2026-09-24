import path from 'path';
import { ApiError } from '../middleware/errorHandler';

/**
 * Het volledige pad van `bestandsnaam` in `map`, en nergens anders.
 *
 * Voor een bestand dat multer net heeft opgeslagen: de naam kiest de server
 * (in de `filename` van diskStorage), maar `req.file.path` komt via het
 * verzoek binnen en geldt voor CodeQL dus als invoer van de gebruiker. Van dat
 * pad telt hier alleen de bestandsnaam, en het resultaat moet in de map
 * liggen; anders volgt een 400. Zelfde aanpak als `pakPadInUploadmap` in
 * routes/music-pieces.ts.
 */
export function bestandInMap(map: string, bestandsnaam: string): string {
  const basis = path.resolve(map);
  const pad = path.resolve(basis, path.basename(bestandsnaam));
  if (!pad.startsWith(basis + path.sep)) {
    throw new ApiError(400, 'Ongeldig bestand.');
  }
  return pad;
}
