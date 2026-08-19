/**
 * De foutlogger mag geen wachtwoorden wegschrijven.
 *
 * In productie liep een mislukte Spond-koppeling via deze middleware, die de
 * volledige aanvraag meelogde. Daardoor stond het wachtwoord van de gebruiker
 * leesbaar in de logs:
 *
 *   body: { username: 'iemand@example.com', password: '<leesbaar>' }
 *
 * Logs worden bewaard, doorgestuurd en door meer mensen gelezen dan de
 * aanvraag zelf. Dit is dus een lek, geen ongemak.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import { maskeerGeheimen } from '../../middleware/errorHandler';

describe('Maskeren van geheimen in logregels', () => {
  it('haalt het wachtwoord uit de Spond-aanvraag', () => {
    const uit = maskeerGeheimen({
      username: 'iemand@example.com',
      password: 'GeheimWachtwoord123',
      syncEnabled: true,
    }) as Record<string, unknown>;

    expect(uit.password).toBe('[weggelaten]');
    expect(uit.username).toBe('iemand@example.com');
    expect(uit.syncEnabled).toBe(true);
    expect(JSON.stringify(uit)).not.toContain('GeheimWachtwoord123');
  });

  it('kijkt niet naar hoofdletters', () => {
    const uit = maskeerGeheimen({ Password: 'x', NEWPASSWORD: 'y' }) as Record<string, unknown>;
    expect(uit.Password).toBe('[weggelaten]');
    expect(uit.NEWPASSWORD).toBe('[weggelaten]');
  });

  it('komt ook bij geneste velden', () => {
    const uit = maskeerGeheimen({ config: { spond: { password: 'diep' } } }) as any;
    expect(uit.config.spond.password).toBe('[weggelaten]');
  });

  it('loopt door lijsten heen', () => {
    const uit = maskeerGeheimen({ koppelingen: [{ apiKey: 'een' }, { apiKey: 'twee' }] }) as any;
    expect(uit.koppelingen[0].apiKey).toBe('[weggelaten]');
    expect(uit.koppelingen[1].apiKey).toBe('[weggelaten]');
  });

  it('maskeert tokens en sleutels', () => {
    const uit = maskeerGeheimen({
      token: 'a',
      refreshToken: 'b',
      clientSecret: 'c',
      mfaCode: 'd',
    }) as Record<string, unknown>;

    expect(Object.values(uit)).toEqual(['[weggelaten]', '[weggelaten]', '[weggelaten]', '[weggelaten]']);
  });

  it('laat gewone waarden met rust', () => {
    expect(maskeerGeheimen('tekst')).toBe('tekst');
    expect(maskeerGeheimen(42)).toBe(42);
    expect(maskeerGeheimen(null)).toBe(null);
    expect(maskeerGeheimen(undefined)).toBe(undefined);
  });

  it('blijft eindig bij een verwijzing naar zichzelf', () => {
    const kring: Record<string, unknown> = { password: 'x' };
    kring.zelf = kring;
    expect(() => maskeerGeheimen(kring)).not.toThrow();
  });
});
