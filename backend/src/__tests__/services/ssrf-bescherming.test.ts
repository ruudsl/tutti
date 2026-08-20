/**
 * Adressen die uit een aanvraag komen mogen de server niet overal heen sturen.
 *
 * downloadPdf kreeg de URL rechtstreeks uit de body: een lid van de
 * muziekcommissie kon de server elk bereikbaar adres laten opvragen, ook binnen
 * het eigen netwerk. De betaalfuncties zetten een kenmerk uit de aanvraag in
 * het pad, waarmee een aanroeper met '../' een ander eindpunt van de
 * betaaldienst kon raken met de sleutel van de vereniging eraan vast.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import { downloadPdf } from '../../services/imslp';

describe('SSRF-bescherming', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: new Map(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('downloadPdf', () => {
    it('haalt een bestand van imslp op', async () => {
      await expect(downloadPdf('https://ks.imslp.net/files/abc/mars.pdf')).resolves.toBeInstanceOf(Buffer);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('accepteert een subdomein van imslp', async () => {
      await expect(downloadPdf('https://ks4.imslp.net/files/abc/mars.pdf')).resolves.toBeInstanceOf(Buffer);
    });

    it('weigert een willekeurig ander adres', async () => {
      await expect(downloadPdf('https://kwaadaardig.example/mars.pdf')).rejects.toThrow(/host is not allowed/);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('weigert een adres binnen het eigen netwerk', async () => {
      for (const url of [
        'https://127.0.0.1/admin',
        'https://169.254.169.254/latest/meta-data/',
        'https://localhost:3000/api/users',
      ]) {
        await expect(downloadPdf(url), url).rejects.toThrow(/host is not allowed/);
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('weigert een adres dat imslp alleen in het pad noemt', async () => {
      await expect(downloadPdf('https://kwaadaardig.example/imslp.org/mars.pdf')).rejects.toThrow(
        /host is not allowed/,
      );
    });

    it('weigert een host die op imslp lijkt maar het niet is', async () => {
      await expect(downloadPdf('https://imslp.org.kwaadaardig.example/mars.pdf')).rejects.toThrow(
        /host is not allowed/,
      );
    });

    it('weigert een ander protocol dan https', async () => {
      await expect(downloadPdf('http://imslp.org/mars.pdf')).rejects.toThrow(/Only HTTPS/);
      await expect(downloadPdf('file:///etc/passwd')).rejects.toThrow(/Only HTTPS/);
    });

    it('weigert een adres met inloggegevens erin', async () => {
      await expect(downloadPdf('https://gebruiker:geheim@imslp.org/mars.pdf')).rejects.toThrow(/credentials/);
    });

    it('weigert iets dat helemaal geen adres is', async () => {
      await expect(downloadPdf('geen adres')).rejects.toThrow(/Invalid IMSLP download URL/);
    });
  });
});
