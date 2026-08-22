/**
 * Het vullen en teruglezen van de verkoopdata van een kaartsoort.
 *
 * Een `datetime-local`-veld praat lokale tijd, de server praat UTC. Ging die
 * vertaling over `toISOString()`, dan kreeg de gebruiker de UTC-tijd in het
 * veld te zien: in de Nederlandse zomer twee uur te vroeg. En omdat het
 * opslaan diezelfde tekst wél als lokale tijd las, schoof het tijdstip bij
 * elke ronde door het formulier opnieuw twee uur op. Openen en meteen weer
 * opslaan, zonder iets te veranderen, verzette de verkoopstart dus.
 *
 * De tijdzone staat hier vast op Amsterdam. Met de tijdzone van de machine
 * zou deze test in Londen of Reykjavik toevallig slagen terwijl de fout er
 * gewoon nog zit - en in de winter iets anders zeggen dan in de zomer.
 */

process.env.TZ = 'Europe/Amsterdam';

import { describe, it, expect } from 'vitest';
import { naarDatumTijdVeld, naarIsoDatumTijd } from '../Concerts/datumTijd';

describe('naarDatumTijdVeld', () => {
  it('gaat uit van de tijdzone die deze test zelf vastzet', () => {
    // Slaat deze over, dan zegt de rest van dit bestand niets: dan meet hij de
    // tijdzone van de machine in plaats van het gedrag van de code.
    expect(new Date('2026-07-01T18:00:00.000Z').getHours()).toBe(20);
  });

  it('toont een zomertijdstip in lokale tijd, niet in UTC', () => {
    // 18:00 UTC is in Nederland 20:00 's avonds. Het veld hoort 20:00 te tonen.
    expect(naarDatumTijdVeld('2026-07-01T18:00:00.000Z')).toBe('2026-07-01T20:00');
  });

  it('toont een wintertijdstip in lokale tijd, met de andere sprong', () => {
    // In de winter is het verschil één uur in plaats van twee. Een test die
    // alleen de zomer bekijkt, laat een vaste correctie van twee uur door.
    expect(naarDatumTijdVeld('2026-01-15T09:30:00.000Z')).toBe('2026-01-15T10:30');
  });

  it('houdt de dag heel als de lokale tijd over middernacht heen valt', () => {
    // 23:00 UTC is hier al de volgende dag; alleen de klok verzetten is niet genoeg.
    expect(naarDatumTijdVeld('2026-07-01T23:00:00.000Z')).toBe('2026-07-02T01:00');
  });

  it('vult maand, dag en uur aan tot twee cijfers', () => {
    expect(naarDatumTijdVeld('2026-03-05T07:04:00.000Z')).toBe('2026-03-05T08:04');
  });

  it('geeft een lege tekst als er geen datum is', () => {
    expect(naarDatumTijdVeld(null)).toBe('');
    expect(naarDatumTijdVeld('')).toBe('');
  });

  it('geeft een lege tekst bij onleesbare invoer, in plaats van "Invalid Date"', () => {
    expect(naarDatumTijdVeld('geen datum')).toBe('');
  });
});

describe('naarIsoDatumTijd', () => {
  it('leest de veldwaarde als lokale tijd en levert UTC', () => {
    expect(naarIsoDatumTijd('2026-07-01T20:00')).toBe('2026-07-01T18:00:00.000Z');
  });

  it('geeft undefined bij een leeg of onleesbaar veld', () => {
    expect(naarIsoDatumTijd('')).toBeUndefined();
    expect(naarIsoDatumTijd('geen datum')).toBeUndefined();
  });
});

describe('heen en weer door het formulier', () => {
  it('laat het tijdstip staan waar het stond', () => {
    const vanDeServer = '2026-07-01T18:00:00.000Z';

    const inHetVeld = naarDatumTijdVeld(vanDeServer);
    const opgeslagen = naarIsoDatumTijd(inHetVeld);

    expect(opgeslagen).toBe(vanDeServer);
  });

  it('schuift ook na drie keer openen en opslaan niet op', () => {
    // Dit is wat de gebruiker merkte: niet één verkeerde weergave, maar een
    // verkoopstart die elke bewerking twee uur verder naar voren kroop.
    let tijdstip = '2026-07-01T18:00:00.000Z';
    for (let ronde = 0; ronde < 3; ronde++) {
      tijdstip = naarIsoDatumTijd(naarDatumTijdVeld(tijdstip)) as string;
    }

    expect(tijdstip).toBe('2026-07-01T18:00:00.000Z');
  });
});
