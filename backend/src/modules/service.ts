/**
 * Lezen en schrijven van de aan/uit-stand per vereniging.
 *
 * De tabel bevat alleen afwijkingen van de standaard. Een vereniging die nooit
 * iets heeft ingesteld heeft geen enkele rij, en krijgt defaultEnabled uit de
 * registry. Zo hoeft er bij het toevoegen van een module niets te worden
 * gevuld voor bestaande verenigingen.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';
import { MODULES, ModuleDefinition, getModule } from './registry';

/**
 * De stand wordt op vrijwel elk verzoek gelezen, dus die houden we vast.
 * De cache is per vereniging en wordt bij elke wijziging leeggegooid; er is
 * geen tijdslimiet omdat een wijziging alleen via setModuleEnabled loopt.
 */
const cache = new Map<string, Map<string, boolean>>();

function loadOverrides(associationId: string): Map<string, boolean> {
  const cached = cache.get(associationId);
  if (cached) {
    return cached;
  }

  const rows = db
    .prepare('SELECT module_key, enabled FROM association_modules WHERE association_id = ?')
    .all(associationId) as { module_key: string; enabled: number }[];

  const overrides = new Map(rows.map((r) => [r.module_key, r.enabled === 1]));
  cache.set(associationId, overrides);
  return overrides;
}

/** Vergeet de gecachete stand van een vereniging (of van alles). */
export function clearModuleCache(associationId?: string): void {
  if (associationId) {
    cache.delete(associationId);
  } else {
    cache.clear();
  }
}

/**
 * Staat een module aan voor deze vereniging?
 *
 * Een onbekende sleutel telt als "aan": dan is er geen module die iets
 * verbergt, en een typefout in een middleware mag geen functionaliteit
 * onbereikbaar maken.
 */
export function isModuleEnabled(associationId: string | null | undefined, key: string): boolean {
  const definition = getModule(key);
  if (!definition) {
    return true;
  }
  if (!associationId) {
    return definition.defaultEnabled;
  }

  const override = loadOverrides(associationId).get(key);
  return override ?? definition.defaultEnabled;
}

/** De sleutels van alle modules die voor deze vereniging aan staan. */
export function getEnabledModuleKeys(associationId: string | null | undefined): string[] {
  return MODULES.filter((m) => isModuleEnabled(associationId, m.key)).map((m) => m.key);
}

export interface ModuleState extends ModuleDefinition {
  enabled: boolean;
}

/** Alle modules met hun huidige stand, voor het beheerscherm. */
export function getModuleStates(associationId: string | null | undefined): ModuleState[] {
  return MODULES.map((m) => ({ ...m, enabled: isModuleEnabled(associationId, m.key) }));
}

/**
 * Zet een module aan of uit.
 *
 * Er wordt niets aan de gegevens van de module gedaan: uitzetten verbergt,
 * aanzetten laat alles weer zien zoals het was.
 */
export function setModuleEnabled(associationId: string, key: string, enabled: boolean, updatedBy: string): void {
  if (!getModule(key)) {
    throw new Error(`Onbekende module: ${key}`);
  }

  db.prepare(
    `
    INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(association_id, module_key)
    DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(uuidv4(), associationId, key, enabled ? 1 : 0, updatedBy);

  clearModuleCache(associationId);
  logger.info(`Module ${key} ${enabled ? 'aangezet' : 'uitgezet'} voor vereniging ${associationId}`);
}
