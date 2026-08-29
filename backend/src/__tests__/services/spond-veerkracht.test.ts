/**
 * Wat er gebeurt als Spond hikt of omvalt.
 *
 * De koppeling met Spond loopt in geplande taken en in het verzoek van een
 * gebruiker. Drie dingen tellen daarbij:
 *
 * 1. **Er staat een tijdslimiet op.** fetch wacht van zichzelf oneindig lang;
 *    een Spond dat de verbinding openhoudt hield daarmee de hele
 *    synchronisatieronde vast.
 * 2. **Een hik wordt herkanst.** Ophalen en een aanwezigheid zetten zijn
 *    allebei te herhalen: het zijn bewerkingen die uitlezen of overschrijven,
 *    niet bewerkingen die toevoegen.
 * 3. **Een echte storing wordt overgeslagen.** Ligt Spond eruit, dan hoeft niet
 *    elke aanroep opnieuw vijftien seconden te wachten.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import { SpondClient } from '../../services/spond';
import { StroomonderbrekerOpenFout, stroomonderbreker } from '../../utils/veerkracht';

function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

/** Een rij antwoorden; het laatste wordt daarna herhaald. */
function dienst(...antwoorden: Response[]) {
  const aanmelding = antwoord(200, { loginToken: 'token-abc' });
  const rij = [aanmelding, ...antwoorden];
  let volgende = 0;
  const nep = vi.fn(async () => rij[Math.min(volgende++, rij.length - 1)]);
  vi.stubGlobal('fetch', nep);
  return nep;
}

describe('Spond bij storingen', () => {
  let client: SpondClient;

  beforeEach(() => {
    client = new SpondClient('iemand@example.com', 'geheim');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('geeft elke aanroep een tijdslimiet mee', async () => {
    const nep = dienst(antwoord(200, []));

    await client.getGroups();

    for (const aanroep of nep.mock.calls) {
      const opties = (aanroep as unknown[])[1] as RequestInit;
      expect(opties.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('probeert het na een storing nog eens en slaagt alsnog', async () => {
    const nep = dienst(antwoord(503, 'Service Unavailable'), antwoord(200, [{ id: 'g1', name: 'Harmonie' }]));

    const groepen = await client.getGroups();

    expect(groepen).toHaveLength(1);
    // aanmelden, mislukte poging, geslaagde poging
    expect(nep).toHaveBeenCalledTimes(3);
  });

  it('probeert het niet nog eens bij een antwoord dat niet vanzelf overgaat', async () => {
    const nep = dienst(antwoord(403, 'Forbidden'));

    await expect(client.getGroups()).rejects.toThrow('Spond API error: 403');
    expect(nep).toHaveBeenCalledTimes(2);
  });

  it('slaat Spond over zodra hij er echt uit ligt', async () => {
    const nep = dienst(antwoord(500, 'Internal Server Error'));

    for (let i = 0; i < 5; i++) {
      await client.getGroups().catch(() => undefined);
    }
    expect(stroomonderbreker('spond').stand).toBe('open');

    const totNuToe = nep.mock.calls.length;
    await expect(client.getGroups()).rejects.toBeInstanceOf(StroomonderbrekerOpenFout);
    expect(nep).toHaveBeenCalledTimes(totNuToe);
  });
});
