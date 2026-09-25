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

  // IPv6-vormen die een IPv4-adres in zich dragen en daar via een vertaler,
  // tunnel of de eigen netwerkkaart ook uitkomen. Deze gingen er eerder door.
  it.each([
    ['IPv4-compatibel (::/96)', 'http://[::127.0.0.1]/'],
    ['IPv4-compatibel naar een privénetwerk', 'http://[::a00:1]/'],
    ['6to4 met 127.0.0.1 erin', 'http://[2002:7f00:1::]/'],
    ['6to4 met een thuisnetwerk erin', 'http://[2002:c0a8:101::1]/'],
    ['NAT64 (64:ff9b::/96)', 'http://[64:ff9b::a9fe:a9fe]/'],
    ['NAT64 voor lokaal gebruik (64:ff9b:1::/48)', 'http://[64:ff9b:1::a00:5]/'],
    ['IPv4-mapped in hex', 'http://[::ffff:a9fe:a9fe]/'],
    ['IPv4-mapped voluit geschreven', 'http://[0:0:0:0:0:ffff:7f00:1]/'],
    ['IPv4-translated (::ffff:0:0:0/96)', 'http://[::ffff:0:7f00:1]/'],
    ['Teredo', 'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/'],
    ['IPv6 site-local', 'http://[fec0::1]/'],
  ])('weigert %s', async (_naam, adres) => {
    await expect(controleerUitgaandAdres(adres, wijstNaar('93.184.216.34'))).rejects.toBeInstanceOf(OnveiligAdresFout);
  });

  it.each([
    ['IPv4-mapped', '::ffff:169.254.169.254'],
    ['6to4', '2002:a9fe:a9fe::1'],
    ['IPv4-compatibel', '::10.0.0.5'],
    ['NAT64', '64:ff9b:1::7f00:1'],
  ])('weigert een naam die naar een %s-adres met een intern IPv4-adres wijst', async (_naam, adres) => {
    await expect(controleerUitgaandAdres('https://tunnel.voorbeeld.nl/', wijstNaar(adres))).rejects.toBeInstanceOf(
      OnveiligAdresFout,
    );
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

  it('laat een IPv4-mapped openbaar adres door: dat is gewoon dat IPv4-adres', () => {
    expect(isVerbodenIp('::ffff:93.184.216.34')).toBe(false);
    expect(isVerbodenIp('::ffff:5db8:d822')).toBe(false);
  });

  it('negeert de zone van een link-local adres', () => {
    expect(isVerbodenIp('fe80::1%eth0')).toBe(true);
  });

  it('ziet iets dat geen IP-adres is als verboden', () => {
    expect(isVerbodenIp('localhost')).toBe(true);
  });
});
