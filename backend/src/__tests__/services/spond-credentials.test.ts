/**
 * Een onleesbaar Spond-wachtwoord moet als zodanig herkenbaar zijn.
 *
 * De sleutel wordt afgeleid van JWT_SECRET. In render.yaml staat die op
 * generateValue, dus bij het opnieuw aanmaken van de service krijgt hij een
 * nieuwe waarde. Alles wat daarvoor is opgeslagen valt dan om op de
 * authenticatietag van AES-GCM.
 *
 * Zonder eigen fouttype liep dat als een generieke 500 naar buiten, en dan
 * lijkt het alsof Spond de inloggegevens weigert. De gebruiker gaat vervolgens
 * zijn wachtwoord controleren terwijl daar niets mis mee is: de koppeling moet
 * opnieuw worden ingesteld.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import { encryptPassword, decryptPassword, SpondCredentialsUnreadableError } from '../../services/spond';

describe('Spond-inloggegevens', () => {
  it('leest terug wat het heeft opgeslagen', () => {
    expect(decryptPassword(encryptPassword('geheim123'))).toBe('geheim123');
  });

  it('kan met leestekens en accenten overweg', () => {
    const wachtwoord = 'Wachtwoord!@#$ mét accenten';
    expect(decryptPassword(encryptPassword(wachtwoord))).toBe(wachtwoord);
  });

  it('herkent een tekst die helemaal niet het juiste formaat heeft', () => {
    expect(() => decryptPassword('zomaar wat')).toThrow(SpondCredentialsUnreadableError);
  });

  it('herkent gegevens die met een andere sleutel zijn opgeslagen', () => {
    // Dit is het geval dat in productie voorkwam: het formaat klopt, de drie
    // delen kloppen, maar de authenticatietag komt niet uit op deze sleutel.
    const [iv, , tekst] = encryptPassword('geheim123').split(':');
    const vreemdeTag = 'a'.repeat(32);

    expect(() => decryptPassword(`${iv}:${vreemdeTag}:${tekst}`)).toThrow(SpondCredentialsUnreadableError);
  });

  it('geeft een melding die zegt wat er moet gebeuren', () => {
    try {
      decryptPassword('kapot');
      expect.unreachable('had moeten falen');
    } catch (err) {
      expect((err as Error).message).toContain('ontsleuteld');
    }
  });
});
