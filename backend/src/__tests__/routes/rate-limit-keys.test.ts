/**
 * De inloglimiet moet ook voor IPv6 werken.
 *
 * express-rate-limit gebruikte hier req.ip rechtstreeks als sleutel. Elk
 * IPv6-adres telt dan apart, en wie een /64 heeft beschikt over 2^64 adressen:
 * die komt nooit aan de limiet van vijf pogingen. De bescherming tegen brute
 * force op inloggen gold daarmee in de praktijk alleen voor IPv4.
 *
 * De bibliotheek meldt dit zelf bij het opzetten van de limiter
 * (ERR_ERL_KEY_GEN_IPV6). Die melding stond in de productielogs; deze test
 * zorgt dat hij niet terugkomt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipKeyGenerator } from 'express-rate-limit';

describe('sleutels van de rate limiters', () => {
  const errors: unknown[][] = [];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errors.length = 0;
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    spy.mockRestore();
    vi.resetModules();
  });

  it('zet de limiters op zonder IPv6-waarschuwing', async () => {
    vi.resetModules();
    await import('../../routes/auth');

    const complaints = errors.flat().filter((e) => JSON.stringify(e ?? '').includes('ERR_ERL_KEY_GEN_IPV6'));

    expect(complaints).toEqual([]);
  });

  it('vat adressen uit hetzelfde IPv6-blok samen', () => {
    const a = ipKeyGenerator('2001:db8:1234:5678:9abc:def0:1234:5678');
    const b = ipKeyGenerator('2001:db8:1234:5678:0000:0000:0000:0001');

    // Twee adressen die dezelfde partij toebehoren, tellen als één.
    expect(a).toBe(b);
  });

  it('laat IPv4-adressen ongemoeid', () => {
    expect(ipKeyGenerator('203.0.113.42')).toBe('203.0.113.42');
  });

  it('houdt verschillende IPv6-blokken uit elkaar', () => {
    expect(ipKeyGenerator('2001:db8:1111::1')).not.toBe(ipKeyGenerator('2001:db8:9999::1'));
  });
});
