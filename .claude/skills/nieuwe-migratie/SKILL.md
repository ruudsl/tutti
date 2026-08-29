---
name: nieuwe-migratie
description: Een databasewijziging in Tutti doorvoeren. Gebruik dit bij elke wijziging aan tabellen, kolommen, indexen of bestaande rijen - nooit alleen schema.ts aanpassen.
---

# Een migratie schrijven

Er zijn twee beschrijvingen van het schema en ze zijn allebei nodig:

- `backend/src/database/schema.ts` - hoe een **verse** installatie eruitziet.
- `backend/src/migrations/*.ts` - hoe een **bestaande** installatie er komt.

Wie alleen `schema.ts` aanpast verandert niets voor wie de applicatie al draait.
Wie alleen een migratie schrijft laat nieuwe installaties achter zonder de
kolom. Bij een structuurwijziging doe je dus beide.

## 1. Bestand aanmaken

```bash
npm run migrate:create --workspace=backend -- naam_in_het_nederlands
```

Dat levert `backend/src/migrations/<tijdstempel>_naam_in_het_nederlands.ts` met
een `up` en een `down`. De tijdstempel bepaalt de volgorde en verandert niet
meer nadat de migratie is uitgeleverd.

## 2. Schrijven

```ts
export const up = (): void => {
  logger.info('Running migration: naam (up)');
  db.exec(`ALTER TABLE leden ADD COLUMN telefoon TEXT`);
  logger.info('Migration completed: naam');
};

export const down = (): void => {
  logger.info('Running migration: naam (down)');
  // ...
};
```

Regels:

- **`down` moet echt werken.** Een lege `down` of een `down` die gooit maakt de
  migratie onomkeerbaar; dat merk je pas als je terug moet.
- **Prepared statements** voor alles met waarden erin; `db.exec` alleen voor DDL
  zonder invoer.
- **Idempotent waar het kan**: `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `INSERT OR IGNORE`.
- **Log wat je hebt gedaan**, met aantallen: `${gezet} van ${totaal} rijen`.
  Bij een migratie die gegevens aanraakt is dat het enige bewijs achteraf.
- **Meerdere samenhangende stappen in `withTransaction`**
  (`backend/src/utils/database.ts`), zodat een halve migratie niet blijft staan.

## 3. SQLite-eigenaardigheden

- **`ALTER TABLE ... DROP COLUMN` en het wijzigen van een kolomtype kunnen niet.**
  Dat gaat via het patroon: nieuwe tabel maken, `INSERT INTO ... SELECT`, oude
  tabel droppen, hernoemen. Zet dat in een transactie.
- **`PRAGMA foreign_keys` staat aan.** Een `DELETE` die een verwijzing
  achterlaat faalt. Ruim in de goede volgorde op.
- **Standaard is `NO ACTION`**, niet `CASCADE`. Wil je dat kinderen meegaan, dan
  schrijf je dat expliciet - en bij een bestaande tabel betekent dat de
  tabel-herbouw hierboven.
- Money-kolommen zijn `REAL`. Dat is bestaande praktijk; introduceer geen
  nieuwe, en zie `docs/POSTGRES_MIGRATION.md`.

## 4. Gegevens die er al zijn

De vraag die het vaakst wordt overgeslagen: **wat gebeurt er met de rijen die er
al staan?**

- Een `NOT NULL`-kolom toevoegen aan een gevulde tabel heeft een `DEFAULT` nodig,
  of een tweede stap die de bestaande rijen vult.
- Zet je bestaande functionaliteit achter een standaard-uit vlag, vul dan de
  uitzonderingen. Zie de skill `nieuwe-module`, stap 4.
- Verwijder je gegevens, controleer dan of ze in de AVG-export en het
  bewaartermijnenoverzicht staan (`docs/PIA.md`, `docs/GDPR.md`).

## 5. Uitproberen

```bash
npm run migrate:status --workspace=backend
npm run migrate:up     --workspace=backend
npm run migrate:down   --workspace=backend   # draait de laatste terug
npm run migrate:up     --workspace=backend   # en weer vooruit
```

Heen, terug, en opnieuw heen. Faalt de tweede `up`, dan is je `down`
onvolledig.

Controleer het resultaat op de draaiende database, niet in de bron:

```sql
PRAGMA table_info(leden);
PRAGMA foreign_key_list(leden);
```

## Checklist

- [ ] Migratie met werkende `up` én `down`
- [ ] `schema.ts` bijgewerkt bij een structuurwijziging
- [ ] Bestaande rijen bedacht en waar nodig gevuld
- [ ] Heen-terug-heen gedraaid
- [ ] Test die het nieuwe gedrag afdekt
- [ ] `docs/DATABASE.md` bijgewerkt bij een nieuwe tabel
