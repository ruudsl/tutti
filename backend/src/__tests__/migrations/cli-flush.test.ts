/**
 * Regressietest: de migratie-CLI moet zijn wijzigingen wegschrijven.
 *
 * De databasewrapper plant schrijfacties in een debounced save met een unref'd
 * timer, zodat die het proces niet openhoudt. De CLI eindigde direct met
 * process.exit(), waardoor die timer nooit afging: elke migratie meldde
 * "Applied successfully" maar belandde nooit op schijf. Migraties waren
 * daardoor in de praktijk nooit toegepast.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const cliSource = fs.readFileSync(path.join(__dirname, '../../migrations/cli.ts'), 'utf-8');

describe('migration CLI', () => {
  it('flushes before exiting successfully', () => {
    const afterCatch = cliSource.slice(cliSource.indexOf('} catch (error) {'));

    expect(afterCatch).toContain('flushOrWarn();');
    expect(afterCatch.indexOf('flushOrWarn();')).toBeLessThan(afterCatch.indexOf('process.exit(0)'));
  });

  it('also flushes when a command fails', () => {
    const start = cliSource.indexOf('} catch (error) {');
    const catchBlock = cliSource.slice(start, cliSource.indexOf('}', cliSource.indexOf('process.exit(1);', start)));

    expect(catchBlock).toContain('flushOrWarn();');
  });

  it('uses the wrapper flush, which clears the debounce timer', () => {
    expect(cliSource).toContain('db.flush()');
  });
});
