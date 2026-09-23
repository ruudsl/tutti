/**
 * Adressen die een gebruiker opgeeft en die de server daarna zelf aanroept.
 *
 * Er gaat hier geen DNS-verzoek de deur uit: namen worden opgezocht met een
 * nep-opzoeker die per test zegt waar een naam heen wijst.
 */

import { describe, it, expect } from 'vitest';
import { controleerUitgaandAdres, isVerbodenIp, OnveiligAdresFout } from '../../utils/uitgaandAdres';

/** Een opzoeker die elke naam naar deze adressen laat wijzen. */
const wijstNaar =
  (...adressen: string[]) =>
  async () =>
    adressen.map((address) => ({ address }));

const nietTeVinden = async () => {
  throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
};

describe('controleerUitgaandAdres', () => {
  it('laat een gewoon openbaar adres door', async () => {
    const url = await controleerUitgaandAdres('https://hooks.voorbeeld.nl/tutti', wijstNaar('93.184.216.34'));
    expect(url.hostname).toBe('hooks.voorbeeld.nl');
  });

  it.each([
    ['de machine zelf', 'http://127.0.0.1:3001/api/admin'],
    ['de rest van 127/8', 'http://127.1.2.3/'],
    ['het metadata-adres van een cloudomgeving', 'http://169.254.169.254/latest/meta-data/'],
    ['een privénetwerk', 'http://10.0.0.5/'],
    ['het Docker-netwerk', 'http://172.17.0.2:3001/'],
    ['een thuisnetwerk', 'http://192.168.1.1/'],
    ['carrier-grade NAT', 'http://100.64.0.1/'],
    ['"dit netwerk"', 'http://0.0.0.0/'],
    ['IPv6 van de machine zelf', 'http://[::1]/'],
    ['IPv4 verpakt in IPv6', 'http://[::ffff:127.0.0.1]/'],
    ['IPv6 unique local', 'http://[fd00::1]/'],
    ['IPv6 link-local', 'http://[fe80::1]/'],
  ])('weigert %s', async (_naam, adres) => {
    await expect(controleerUitgaandAdres(adres, wijstNaar('93.184.216.34'))).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it('weigert 127.0.0.1 ook in hexadecimale en decimale schrijfwijze', async () => {
    // De URL-ontleder van Node maakt daar 127.0.0.1 van; de controle moet dat
    // genormaliseerde adres zien en niet de tekst.
    await expect(controleerUitgaandAdres('http://0x7f.1/')).rejects.toBeInstanceOf(OnveiligAdresFout);
    await expect(controleerUitgaandAdres('http://2130706433/')).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it('weigert een naam die naar een intern adres wijst', async () => {
    await expect(controleerUitgaandAdres('https://intern.voorbeeld.nl/', wijstNaar('10.0.0.5'))).rejects.toBeInstanceOf(
      OnveiligAdresFout,
    );
  });

  it('weigert een naam waarvan maar één van de adressen intern is', async () => {
    // Welke de verbinding kiest, bepalen wij niet.
    await expect(
      controleerUitgaandAdres('https://half.voorbeeld.nl/', wijstNaar('93.184.216.34', '127.0.0.1')),
    ).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it('weigert een ander protocol dan http of https', async () => {
    await expect(controleerUitgaandAdres('file:///etc/passwd')).rejects.toBeInstanceOf(OnveiligAdresFout);
    await expect(controleerUitgaandAdres('gopher://voorbeeld.nl/')).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it('weigert een adres met inloggegevens erin', async () => {
    await expect(
      controleerUitgaandAdres('https://gebruiker:wachtwoord@hooks.voorbeeld.nl/', wijstNaar('93.184.216.34')),
    ).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it('weigert een naam die niet bestaat, met een melding die dat zegt', async () => {
    await expect(controleerUitgaandAdres('https://bestaat-niet.voorbeeld/', nietTeVinden)).rejects.toThrow(
      /niet te vinden/,
    );
  });

  it('weigert iets dat geen adres is', async () => {
    await expect(controleerUitgaandAdres('geen adres')).rejects.toBeInstanceOf(OnveiligAdresFout);
  });
});

describe('isVerbodenIp', () => {
  it('laat openbare adressen door, ook de documentatiebereiken', () => {
    expect(isVerbodenIp('93.184.216.34')).toBe(false);
    expect(isVerbodenIp('203.0.113.7')).toBe(false);
    expect(isVerbodenIp('2001:4860:4860::8888')).toBe(false);
  });

  it('ziet iets dat geen IP-adres is als verboden', () => {
    expect(isVerbodenIp('localhost')).toBe(true);
  });
});
