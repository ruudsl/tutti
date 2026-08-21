/**
 * Migration: te ruim uitgedeelde super-admin-rechten terugnemen
 * Created at: 2026-08-21
 *
 * Twee eerdere migraties deden dit:
 *
 *     SELECT id FROM users WHERE role = 'admin'
 *     INSERT OR IGNORE INTO super_admins (id, ...) VALUES ('super-' || id, ...)
 *
 * Die query loopt over alle verenigingen heen. Elke beheerder die bestond toen
 * die migraties draaiden, werd daarmee super-admin van de hele installatie -
 * precies de groep die er buiten moest blijven. requireRole('admin') is
 * verenigingsgebonden; requireSuperAdmin gaat over alles.
 *
 * Wat zo iemand kon: de gegevens van alle verenigingen inzien en wijzigen
 * (IBAN, KvK, factuuradres, abonnement), willekeurige gebruikers tot
 * super-admin promoveren, verenigingen verwijderen, en via
 * POST /switch-association elke vereniging binnenstappen zonder lid te zijn.
 *
 * De seed is uit beide migraties gehaald. Deze migratie ruimt op wat er al
 * stond. De rijen zijn te herkennen aan hun id: de seed gebruikte
 * `super-${user.id}`, terwijl alle bedoelde manieren om een super-admin te
 * maken - init.ts, MAKE_SUPER_ADMIN en de API-route - een uuid gebruiken.
 *
 * De tabel wordt nooit leeggemaakt. Blijft er anders niets over, dan houden we
 * er een aan (bij voorkeur admin@harmonie.nl) en zeggen we er hardop bij dat
 * die nagekeken moet worden. Een installatie zonder super-admin is niet meer
 * te beheren, en dat is een erger probleem dan het probleem dat we oplossen.
 */

import db from '../database/connection';

export function up(): void {
  const bestaat = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'super_admins'`).get();
  if (!bestaat) return;

  const geseed = db.prepare(`SELECT id, user_id FROM super_admins WHERE id LIKE 'super-%'`).all() as {
    id: string;
    user_id: string;
  }[];
  if (geseed.length === 0) return;

  const bedoeld = db.prepare(`SELECT COUNT(*) as aantal FROM super_admins WHERE id NOT LIKE 'super-%'`).get() as {
    aantal: number;
  };

  let teBehouden: string | null = null;
  if (bedoeld.aantal === 0) {
    const platformbeheerder = db
      .prepare(
        `SELECT sa.id FROM super_admins sa
         JOIN users u ON u.id = sa.user_id
         WHERE sa.id LIKE 'super-%' AND u.email = 'admin@harmonie.nl'`,
      )
      .get() as { id: string } | undefined;

    teBehouden = platformbeheerder?.id ?? geseed[0].id;
    console.warn(
      `[migratie] super_admins bevatte alleen automatisch toegekende rijen. ` +
        `Er blijft er een staan (${teBehouden}) zodat de installatie beheerbaar blijft. ` +
        `Controleer wie dat is en pas het zo nodig aan.`,
    );
  }

  const verwijderd = db.prepare(`DELETE FROM super_admins WHERE id LIKE 'super-%' AND id IS NOT ?`).run(teBehouden);

  console.log(`[migratie] ${verwijderd.changes} automatisch toegekende super-admin-rechten teruggenomen.`);
}

export function down(): void {
  // Bewust leeg. Deze migratie neemt rechten terug die nooit uitgedeeld hadden
  // mogen worden; ze weer uitdelen bij een rollback zou het gat heropenen.
}
