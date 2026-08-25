/**
 * Migration: de Spond-module aanzetten voor wie hem al gebruikt
 * Created at: 2026-08-24
 *
 * Spond wordt een module die een beheerder aan of uit kan zetten. Net als de
 * andere modules staat hij standaard uit, want de meeste verenigingen gebruiken
 * Spond niet en zien nu een koppeling waar ze niets aan hebben.
 *
 * Maar "standaard uit" werkt hier anders dan bij een nieuwe module. De tabel
 * association_modules bevat alleen afwijkingen van de standaard: een vereniging
 * zonder rij krijgt defaultEnabled uit de registry. Zonder deze migratie zou de
 * koppeling dus van het ene op het andere moment verdwijnen bij iedereen die
 * hem vandaag gebruikt - de kaart weg, de synchronisatie onbereikbaar, en geen
 * enkele melding waarom.
 *
 * Daarom krijgt elke vereniging met een Spond-configuratie hier een expliciete
 * rij met enabled = 1. Die telt zwaarder dan de standaard, dus voor hen
 * verandert er niets. Wie geen configuratie heeft krijgt geen rij en dus de
 * standaard: uit.
 *
 * Een vereniging die de module later zelf uitzet houdt haar configuratie en
 * haar gekoppelde leden; uitzetten verbergt, het verwijdert niets.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: spond_module_aanzetten (up)');

  const metConfiguratie = db
    .prepare('SELECT DISTINCT association_id FROM spond_config WHERE association_id IS NOT NULL')
    .all() as { association_id: string }[];

  let gezet = 0;
  for (const { association_id } of metConfiguratie) {
    // INSERT OR IGNORE en niet OR REPLACE: heeft een beheerder de module al
    // bewust uitgezet, dan is dat zijn keuze en niet aan deze migratie om
    // terug te draaien. In de praktijk kan die rij er nog niet zijn, maar bij
    // een tweede keer draaien wel.
    const resultaat = db
      .prepare(
        `INSERT OR IGNORE INTO association_modules (id, association_id, module_key, enabled, updated_at)
         VALUES (?, ?, 'spond', 1, datetime('now'))`,
      )
      .run(uuidv4(), association_id);
    gezet += resultaat.changes;
  }

  logger.info(
    `Migration completed: spond_module_aanzetten (${gezet} van ${metConfiguratie.length} verenigingen met een Spond-configuratie)`,
  );
};

export const down = (): void => {
  logger.info('Running migration: spond_module_aanzetten (down)');
  // Alleen de rijen die deze migratie kan hebben gezet. Een beheerder die de
  // module daarna zelf heeft uitgezet heeft enabled = 0, en die rij blijft.
  const resultaat = db.prepare("DELETE FROM association_modules WHERE module_key = 'spond' AND enabled = 1").run();
  logger.info(`Migration completed: spond_module_aanzetten (down, ${resultaat.changes} rijen verwijderd)`);
};
