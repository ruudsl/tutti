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

  describe('doorverwijzingen', () => {
    function antwoordMetDoorverwijzing(naar: string) {
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: naar }),
      };
    }

    function gelukt() {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    }

    it('volgt een doorverwijzing binnen imslp', async () => {
      const opgevraagd: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          opgevraagd.push(url);
          return opgevraagd.length === 1 ? antwoordMetDoorverwijzing('https://ks4.imslp.net/files/echt.pdf') : gelukt();
        }),
      );

      await expect(downloadPdf('https://imslp.org/mars.pdf')).resolves.toBeInstanceOf(Buffer);
      expect(opgevraagd).toHaveLength(2);
      expect(opgevraagd[1]).toContain('ks4.imslp.net');
    });

    it('volgt een doorverwijzing naar buiten imslp niet', async () => {
      // Dit is het gat dat een witte lijst alleen niet dicht: een toegestane
      // host mag de server niet alsnog ergens anders heen sturen.
      const opgevraagd: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          opgevraagd.push(url);
          return antwoordMetDoorverwijzing('http://169.254.169.254/latest/meta-data/');
        }),
      );

      await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow(/Only HTTPS|host is not allowed/);
      expect(opgevraagd).toHaveLength(1);
    });

    it('lost een relatieve doorverwijzing op tegen de huidige host', async () => {
      const opgevraagd: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          opgevraagd.push(url);
          return opgevraagd.length === 1 ? antwoordMetDoorverwijzing('/files/elders.pdf') : gelukt();
        }),
      );

      await expect(downloadPdf('https://imslp.org/mars.pdf')).resolves.toBeInstanceOf(Buffer);
      expect(opgevraagd[1]).toBe('https://imslp.org/files/elders.pdf');
    });

    it('blijft niet eindeloos doorverwijzingen volgen', async () => {
      let teller = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          teller++;
          return antwoordMetDoorverwijzing('https://imslp.org/nog-een-keer.pdf');
        }),
      );

      await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow(/Too many redirects/);
      expect(teller).toBeLessThanOrEqual(6);
    });
  });
});
