/**
 * Bewaakt dat DB_PATH uit .env ook geldt voor instappunten die niet index.ts zijn.
 *
 * connection.ts leest process.env.DB_PATH op moduleniveau. index.ts importeert
 * './config' (dat dotenv.config() aanroept) voor './database/connection', dus
 * daar staat DB_PATH op tijd klaar. De migratie-CLI, db:init en de seed-scripts
 * importeren connection.ts als eerste. Zonder eigen dotenv-aanroep viel DB_PATH
 * daar terug op de standaardnaam data/harmonie.db: migraties landden dan in een
 * andere database dan waar de server naar keek, en de server startte op met
 * ontbrekende tabellen ("no such table: super_admins").
 *
 * Ook bewaakt dat het dev-script de migraties draait. Zonder die stap krijgt een
 * verse database het basisschema wel, maar niet de tabellen die pas in een
 * migratie ontstaan - en breekt het seeden op de eerste daarvan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const backendMap = path.resolve(__dirname, '../../..');

describe('DB_PATH buiten index.ts', () => {
  const bron = fs.readFileSync(path.join(backendMap, 'src/database/connection.ts'), 'utf-8');

  it('connection.ts laadt .env voordat het DB_PATH uitleest', () => {
    const dotenvRegel = bron.split('\n').findIndex((r) => /^import ['"]dotenv\/config['"];/.test(r.trim()));
    const dbPadRegel = bron
      .split('\n')
      .findIndex((r) => r.includes('process.env.DB_PATH') && !r.trim().startsWith('//'));

    expect(dotenvRegel, 'connection.ts moet dotenv/config importeren').toBeGreaterThanOrEqual(0);
    expect(dbPadRegel).toBeGreaterThanOrEqual(0);
    expect(dotenvRegel).toBeLessThan(dbPadRegel);
  });

  it('de migratie-CLI schrijft hangende wijzigingen weg voor het proces stopt', () => {
    const cli = fs.readFileSync(path.join(backendMap, 'src/migrations/cli.ts'), 'utf-8');
    expect(cli).toMatch(/db\.flush\(\)/);
  });

  it('het dev-script draait de migraties voor de server start', () => {
    const pakket = JSON.parse(fs.readFileSync(path.join(backendMap, 'package.json'), 'utf-8'));
    expect(pakket.scripts.dev).toMatch(/migrations\/cli\.ts up/);
    expect(pakket.scripts.dev).toMatch(/watch src\/index\.ts/);
  });
});
