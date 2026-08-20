/**
 * Wie mag welk veld van wie zien.
 *
 * Een lid kan per veld kiezen hoe zichtbaar het is: van `public` tot
 * `admin_only`. Die keuze stond tot nu toe alleen in de tabel. Buiten
 * routes/privacy-settings.ts werd user_privacy_settings nergens gelezen, en
 * binnen die route gaven `section` en `orchestra` allebei onvoorwaardelijk
 * true terug. "Alleen mijn sectie" betekende dus in de praktijk "iedereen".
 *
 * De twee begrippen komen uit het schema:
 *
 * - Een orkest is `user_orchestras`: twee leden delen een orkest als ze in
 *   hetzelfde orkest spelen.
 * - Een sectie is een rij op het podium (`seating_sections`) met de
 *   instrumentgroepen die erin thuishoren (`seating_section_instruments`).
 *   Twee leden delen een sectie als een instrument dat de een speelt en een
 *   instrument dat de ander speelt in dezelfde sectie vallen.
 *
 * Secties hangen aan een orkest en orkesten aan een vereniging, dus de
 * verenigingsgrens zit al in de gegevens. De aanroeper controleert daarnaast
 * altijd zelf dat kijker en eigenaar bij dezelfde vereniging horen; deze
 * module gaat daarvan uit en beslist alleen over zichtbaarheid.
 */

import db from '../database/connection';

export const ZICHTBAARHEDEN = ['admin_only', 'committee', 'orchestra', 'section', 'all_members', 'public'] as const;

export type Zichtbaarheid = (typeof ZICHTBAARHEDEN)[number];

/** Rollen die als commissie tellen bij zichtbaarheid `committee`. */
const COMMISSIEROLLEN = ['music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'];

/** Wat er van een lid nodig is om te beslissen wat hij mag zien. */
export interface Kijker {
  id: string;
  role: string;
  orkesten: Set<string>;
  secties: Set<string>;
}

/** De orkesten waarin een aantal leden speelt, in een enkele query. */
export function orkestenPerLid(userIds: string[]): Map<string, Set<string>> {
  const perLid = new Map<string, Set<string>>();
  if (userIds.length === 0) return perLid;

  const plaatshouders = userIds.map(() => '?').join(',');
  const rijen = db
    .prepare(`SELECT user_id, orchestra_id FROM user_orchestras WHERE user_id IN (${plaatshouders})`)
    .all(...userIds) as { user_id: string; orchestra_id: string }[];

  for (const rij of rijen) {
    if (!perLid.has(rij.user_id)) perLid.set(rij.user_id, new Set());
    perLid.get(rij.user_id)!.add(rij.orchestra_id);
  }
  return perLid;
}

/**
 * De secties waarin een aantal leden zit, in een enkele query.
 *
 * Een lid zit in een sectie als een van zijn instrumenten in die sectie
 * thuishoort. Dat kunnen er meer zijn: wie zowel bugel als trompet speelt zit
 * in beide rijen.
 */
export function sectiesPerLid(userIds: string[]): Map<string, Set<string>> {
  const perLid = new Map<string, Set<string>>();
  if (userIds.length === 0) return perLid;

  const plaatshouders = userIds.map(() => '?').join(',');
  const rijen = db
    .prepare(
      `SELECT ui.user_id, ssi.section_id
       FROM user_instruments ui
       JOIN seating_section_instruments ssi ON ssi.instrument_id = ui.instrument_id
       WHERE ui.user_id IN (${plaatshouders})`,
    )
    .all(...userIds) as { user_id: string; section_id: string }[];

  for (const rij of rijen) {
    if (!perLid.has(rij.user_id)) perLid.set(rij.user_id, new Set());
    perLid.get(rij.user_id)!.add(rij.section_id);
  }
  return perLid;
}

/** Alles wat nodig is om voor een lid te beslissen wat hij van anderen ziet. */
export function haalKijker(userId: string, role: string): Kijker {
  return {
    id: userId,
    role,
    orkesten: orkestenPerLid([userId]).get(userId) ?? new Set(),
    secties: sectiesPerLid([userId]).get(userId) ?? new Set(),
  };
}

function delenIets(a: Set<string>, b: Set<string>): boolean {
  for (const waarde of a) {
    if (b.has(waarde)) return true;
  }
  return false;
}

/**
 * Mag deze kijker dit veld van deze eigenaar zien?
 *
 * De eigen gegevens en die van een beheerder vallen buiten de trap: een lid
 * ziet altijd zichzelf, en een beheerder heeft de ledenadministratie sowieso
 * in handen.
 */
export function magVeldZien(
  kijker: Kijker,
  eigenaarId: string,
  zichtbaarheid: Zichtbaarheid | string,
  eigenaar: { orkesten: Set<string>; secties: Set<string> },
): boolean {
  if (kijker.id === eigenaarId) return true;
  if (kijker.role === 'admin') return true;

  switch (zichtbaarheid) {
    case 'public':
    case 'all_members':
      return true;
    case 'orchestra':
      return delenIets(kijker.orkesten, eigenaar.orkesten);
    case 'section':
      return delenIets(kijker.secties, eigenaar.secties);
    case 'committee':
      return COMMISSIEROLLEN.includes(kijker.role);
    case 'admin_only':
      return false;
    default:
      // Een onbekende stand is geen reden om maar open te zetten.
      return false;
  }
}

/**
 * De zichtbaarheid die voor een veld geldt: wat het lid zelf heeft ingesteld,
 * anders wat de vereniging als standaard heeft, anders `all_members`.
 */
export function geldendeZichtbaarheid(
  eigenInstelling: string | undefined,
  verenigingsstandaard: string | undefined,
): string {
  return eigenInstelling || verenigingsstandaard || 'all_members';
}

/** De privacy-instellingen van een aantal leden, per lid en per veld. */
export function instellingenPerLid(userIds: string[]): Map<string, Map<string, string>> {
  const perLid = new Map<string, Map<string, string>>();
  if (userIds.length === 0) return perLid;

  const plaatshouders = userIds.map(() => '?').join(',');
  const rijen = db
    .prepare(`SELECT user_id, field_name, visibility FROM user_privacy_settings WHERE user_id IN (${plaatshouders})`)
    .all(...userIds) as { user_id: string; field_name: string; visibility: string }[];

  for (const rij of rijen) {
    if (!perLid.has(rij.user_id)) perLid.set(rij.user_id, new Map());
    perLid.get(rij.user_id)!.set(rij.field_name, rij.visibility);
  }
  return perLid;
}

/** De standaarden die een vereniging per veld heeft vastgelegd. */
export function verenigingsstandaarden(associationId: string | null | undefined): Map<string, string> {
  if (!associationId) return new Map();
  const rijen = db
    .prepare('SELECT field_name, default_visibility FROM association_privacy_defaults WHERE association_id = ?')
    .all(associationId) as { field_name: string; default_visibility: string }[];
  return new Map(rijen.map((r) => [r.field_name, r.default_visibility]));
}
