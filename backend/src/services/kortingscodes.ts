/**
 * Kortingscodes bij de kaartverkoop (tabellen discount_codes en
 * discount_code_usage; migratie 20261002220000_kortingscode_bij_bestelling).
 *
 * Eén regel voor wat een geldige code is, voor de controle vooraf
 * (POST /discount-codes/validate) en voor de bestelling zelf
 * (POST /concerts/:id/tickets/order). Er waren er twee, en die verschilden:
 * de ene keek naar het gebruik per koper en naar kaartsoorten, de andere niet.
 *
 * Het gebruik van een code loopt mee met de bestelling:
 *
 * - bij het bestellen wordt de code **gereserveerd** (een rij in
 *   discount_code_usage), in dezelfde transactie als de kaarten. Dat gebeurt
 *   met één voorwaardelijke INSERT, zodat twee gelijktijdige bestellingen niet
 *   samen over het maximum heen kunnen;
 * - bij betalen telt hij als **gebruikt** (`uses_count`);
 * - bij annuleren, verlopen of mislukken gaat de reservering weer weg.
 *
 * Voor het maximum telt `uses_count` (de betaalde bestellingen) plus de
 * lopende bestellingen die nog niet verlopen zijn. Per koper tellen zijn
 * betaalde en lopende bestellingen. Een verlaten winkelmandje houdt een code
 * dus hooguit een half uur vast.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';

export interface KortingscodeRij {
  id: string;
  association_id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  uses_count: number;
  max_uses_per_user: number | null;
  valid_from: string | null;
  valid_until: string | null;
  concert_ids: string | null;
  ticket_type_ids: string | null;
  is_active: number;
}

export type Afwijzing =
  'onbekend' | 'inactief' | 'nog_niet_geldig' | 'verlopen' | 'op' | 'koper' | 'minimum' | 'concert' | 'kaartsoort';

/** De meldingen zoals de API ze altijd gaf; de frontend vertaalt op `reden`. */
const MELDING: Record<Afwijzing, string> = {
  onbekend: 'Invalid discount code',
  inactief: 'This discount code is no longer active',
  nog_niet_geldig: 'This discount code is not yet valid',
  verlopen: 'This discount code has expired',
  op: 'This discount code has reached its maximum number of uses',
  koper: 'You have already used this discount code the maximum number of times',
  minimum: 'Minimum order amount not reached for this discount code',
  concert: 'This discount code is not valid for this concert',
  kaartsoort: 'This discount code is not valid for the selected ticket types',
};

export type KortingsOordeel =
  { geldig: true; code: KortingscodeRij; korting: number } | { geldig: false; reden: Afwijzing; melding: string };

const afgewezen = (reden: Afwijzing): KortingsOordeel => ({ geldig: false, reden, melding: MELDING[reden] });

/** Een lijst uit een JSON-kolom; leeg of onleesbaar betekent: geen beperking. */
function beperking(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const lijst = JSON.parse(json);
    return Array.isArray(lijst) && lijst.length > 0 ? lijst.map(String) : null;
  } catch {
    return null;
  }
}

/** Korting op `bedrag`, op centen afgerond en nooit meer dan het bedrag zelf. */
export function berekenKorting(soort: 'percentage' | 'fixed_amount', waarde: number, bedrag: number): number {
  const ruw = soort === 'percentage' ? (bedrag * waarde) / 100 : waarde;
  return Math.min(Math.round(ruw * 100) / 100, Math.round(bedrag * 100) / 100);
}

/** Voorwaarde op een rij `u` uit discount_code_usage: betaald, of lopend en niet verlopen. */
const ACTIEF = `EXISTS (
  SELECT 1 FROM ticket_orders o
  WHERE o.id = u.order_id
    AND (o.status = 'paid' OR (o.status = 'pending' AND (o.expires_at IS NULL OR o.expires_at > ?)))
)`;

/** Voorwaarde op een rij `u`: een lopende bestelling die nog niet verlopen is. */
const LOPEND = `EXISTS (
  SELECT 1 FROM ticket_orders o
  WHERE o.id = u.order_id AND o.status = 'pending' AND (o.expires_at IS NULL OR o.expires_at > ?)
)`;

/** Hoe vaak de code meetelt voor het maximum: betaald plus lopend. */
const GEBRUIK = `(SELECT uses_count FROM discount_codes WHERE id = ?)
  + (SELECT COUNT(*) FROM discount_code_usage u WHERE u.discount_code_id = ? AND ${LOPEND})`;

export function actiefGebruik(codeId: string): number {
  return (db.prepare(`SELECT ${GEBRUIK} AS n`).get(codeId, codeId, new Date().toISOString()) as { n: number }).n;
}

export function gebruikDoorKoper(codeId: string, email: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM discount_code_usage u
         WHERE u.discount_code_id = ? AND LOWER(u.user_email) = LOWER(?) AND ${ACTIEF}`,
      )
      .get(codeId, email, new Date().toISOString()) as { n: number }
  ).n;
}

export interface KortingsVraag {
  associationId: string;
  code: string;
  concertId: string;
  /** Het bedrag van de kaarten, zonder servicekosten. */
  bedrag: number;
  /** Het bedrag van de kaarten waar de code voor geldt; standaard `bedrag`. */
  bedragGeldig?: number;
  /** De gekozen kaartsoorten; bij een beperkte code moet er minstens één bij horen. */
  kaartsoorten?: string[];
  koperEmail?: string | null;
}

/** Is deze code geldig voor deze bestelling, en hoeveel korting geeft hij? */
export function beoordeelKortingscode(vraag: KortingsVraag): KortingsOordeel {
  const code = db
    .prepare('SELECT * FROM discount_codes WHERE association_id = ? AND UPPER(code) = UPPER(?)')
    .get(vraag.associationId, vraag.code.trim()) as KortingscodeRij | undefined;

  if (!code) return afgewezen('onbekend');
  if (Number(code.is_active) !== 1) return afgewezen('inactief');

  const nu = new Date().toISOString();
  if (code.valid_from && code.valid_from > nu) return afgewezen('nog_niet_geldig');
  if (code.valid_until && code.valid_until < nu) return afgewezen('verlopen');

  if (code.max_uses !== null && actiefGebruik(code.id) >= code.max_uses) return afgewezen('op');

  const perKoper = code.max_uses_per_user ?? 0;
  if (vraag.koperEmail && perKoper > 0 && gebruikDoorKoper(code.id, vraag.koperEmail) >= perKoper) {
    return afgewezen('koper');
  }

  if (code.min_order_amount !== null && vraag.bedrag < code.min_order_amount) return afgewezen('minimum');

  const concerten = beperking(code.concert_ids);
  if (concerten && !concerten.includes(vraag.concertId)) return afgewezen('concert');

  const soorten = beperking(code.ticket_type_ids);
  if (soorten && vraag.kaartsoorten && !vraag.kaartsoorten.some((id) => soorten.includes(id))) {
    return afgewezen('kaartsoort');
  }

  const korting = berekenKorting(code.discount_type, code.discount_value, vraag.bedragGeldig ?? vraag.bedrag);
  return { geldig: true, code, korting };
}

/** De kaartsoorten waarvoor een code geldt; `null` als hij voor alle geldt. */
export function kaartsoortenVanCode(code: KortingscodeRij): string[] | null {
  return beperking(code.ticket_type_ids);
}

/**
 * Reserveer de code voor een bestelling. Roep dit aan in de transactie die de
 * bestelling aanmaakt, na het invoegen van de bestelling.
 *
 * Eén voorwaardelijke INSERT: alleen als het actieve gebruik (en dat van deze
 * koper) onder de grens ligt. Gelukt of niet zie je aan het aantal gewijzigde
 * rijen; controleren en daarna schrijven zou twee gelijktijdige bestellingen
 * samen over de grens laten gaan (docs/POSTGRES_MIGRATION.md §4.H).
 */
export function reserveerKortingscode(code: KortingscodeRij, orderId: string, email: string, korting: number): boolean {
  const nu = new Date().toISOString();
  const perKoper = code.max_uses_per_user ?? 0;
  const resultaat = db
    .prepare(
      `INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_email, discount_amount, used_at)
       SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
       WHERE (? IS NULL OR ${GEBRUIK} < ?)
         AND (? <= 0 OR (SELECT COUNT(*) FROM discount_code_usage u
                         WHERE u.discount_code_id = ? AND LOWER(u.user_email) = LOWER(?) AND ${ACTIEF}) < ?)`,
    )
    .run(
      uuidv4(),
      code.id,
      orderId,
      email,
      korting,
      code.max_uses,
      code.id,
      code.id,
      nu,
      code.max_uses,
      perKoper,
      code.id,
      email,
      nu,
      perKoper,
    );
  return resultaat.changes === 1;
}

/** De bestelling is betaald: de code telt als gebruikt. */
export function telKortingscodeAlsGebruikt(orderId: string): void {
  db.prepare(
    `UPDATE discount_codes SET uses_count = uses_count + 1
     WHERE id = (SELECT discount_code_id FROM ticket_orders WHERE id = ?)`,
  ).run(orderId);
}

/** De bestelling gaat niet door: de reservering vervalt. */
export function geefKortingscodeVrij(orderId: string): void {
  db.prepare('DELETE FROM discount_code_usage WHERE order_id = ?').run(orderId);
}
