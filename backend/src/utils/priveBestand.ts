import fs from 'fs';

/** Alleen lezen en schrijven door de eigenaar: het serverproces. */
export const PRIVE_MODUS = 0o600;

/**
 * Schrijf een bestand dat alleen het serverproces mag lezen: de database, een
 * reservekopie ervan.
 *
 * `writeFileSync` zonder modus gaf 0644 (na de gebruikelijke umask): leesbaar
 * voor elke gebruiker op de machine, en de database bevat alles - leden,
 * wachtwoordhashes, versleutelde koppelingsgeheimen. De modus bij het
 * schrijven geldt alleen voor een nieuw bestand; bestaat het al, dan zet
 * chmod hem alsnog goed.
 */
export function schrijfPriveBestand(pad: string, inhoud: Buffer | Uint8Array): void {
  fs.writeFileSync(pad, inhoud, { mode: PRIVE_MODUS });
  fs.chmodSync(pad, PRIVE_MODUS);
}
