/**
 * Tests voor de kaartverkoop-voorspelling.
 *
 * Dit bestand is rekenwerk: een gewogen gemiddelde van drie methodes
 * (historische bezettingsgraad, verkoopsnelheid, lineaire trend), met een
 * seizoenscorrectie eroverheen. Zulke code geeft altijd *een* getal terug, ook
 * als het nergens op slaat, dus elke test hieronder zet gegevens klaar waarvan
 * de uitkomst met de hand is na te rekenen en legt dat getal vast.
 *
 * De opzet houdt de seizoensfactor waar mogelijk expres op precies 1,0 door
 * alle historische concerten dezelfde bezettingsgraad te geven: dan is elk
 * seizoensgemiddelde gelijk aan het totaalgemiddelde en valt die factor weg uit
 * de som. Wat overblijft is de weging zelf, en die is dan exact controleerbaar.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, TestAssociation } from '../testUtils';
import {
  predictTicketSales,
  calculateOptimalPricing,
  getSalesPredictionSummary,
} from '../../services/salesPredictions';

type Seizoen = 'winter' | 'spring' | 'summer' | 'fall';

/** Datum n dagen vanaf nu, in UTC - net als de dienst zelf rekent. */
function datumOverDagen(dagen: number): string {
  return new Date(Date.now() + dagen * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/** Zelfde seizoensindeling als de dienst hanteert. */
function seizoenVanMaand(maand: number): Seizoen {
  if (maand >= 3 && maand <= 5) return 'spring';
  if (maand >= 6 && maand <= 8) return 'summer';
  if (maand >= 9 && maand <= 11) return 'fall';
  return 'winter';
}

const MAAND_VOOR_SEIZOEN: Record<Seizoen, number> = { winter: 1, spring: 4, summer: 7, fall: 10 };

/**
 * Een datum in het gevraagde seizoen, een aantal jaren terug. Er wordt vanaf nu
 * gerekend zodat de test niet op een vaste datum vastzit en over een jaar
 * vanzelf omvalt.
 */
function datumInSeizoen(seizoen: Seizoen, jarenGeleden: number, dag = 15): string {
  const jaar = new Date().getUTCFullYear() - jarenGeleden;
  const maand = String(MAAND_VOOR_SEIZOEN[seizoen]).padStart(2, '0');
  return `${jaar}-${maand}-${String(dag).padStart(2, '0')}`;
}

describe('salesPredictions', () => {
  let vereniging: TestAssociation;

  function maakConcert(
    verenigingId: string,
    datum: string,
    opties: { concertType?: string | null; venueType?: string | null; deletedAt?: string | null } = {},
  ): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO concerts (id, association_id, name, date, location, concert_type, venue_type, deleted_at)
         VALUES (?, ?, ?, ?, 'De Zalen', ?, ?, ?)`,
      )
      .run(
        id,
        verenigingId,
        `Concert ${datum}`,
        datum,
        opties.concertType ?? null,
        opties.venueType ?? null,
        opties.deletedAt ?? null,
      );
    return id;
  }

  function maakTicketType(concertId: string, prijs: number, aantal: number, verkocht: number): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold)
         VALUES (?, ?, 'Regulier', ?, ?, ?)`,
      )
      .run(id, concertId, prijs, aantal, verkocht);
    return id;
  }

  /** Concert in het verleden met één kaartsoort; bepaalt de historische bezetting. */
  function maakHistorischConcert(
    verenigingId: string,
    datum: string,
    aantal: number,
    verkocht: number,
    prijs = 20,
    opties: { concertType?: string | null; venueType?: string | null; deletedAt?: string | null } = {},
  ): string {
    const concertId = maakConcert(verenigingId, datum, opties);
    maakTicketType(concertId, prijs, aantal, verkocht);
    return concertId;
  }

  /** Eén bestelling met `aantal` kaarten, allemaal aangemaakt op `datum`. */
  function maakBestellingMetKaarten(
    concertId: string,
    ticketTypeId: string,
    datum: string,
    aantal: number,
    status: string,
  ): void {
    const orderId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
         VALUES (?, ?, ?, ?, 'Koper', 'koper@example.com')`,
      )
      .run(orderId, concertId, aantal * 20, status);

    for (let i = 0; i < aantal; i++) {
      testDb
        .prepare(
          `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, qr_code, created_at)
           VALUES (?, ?, ?, 'Koper', 'koper@example.com', ?, ?)`,
        )
        .run(uuidv4(), ticketTypeId, orderId, uuidv4(), `${datum} 12:00:00`);
    }
  }

  beforeEach(() => {
    vereniging = createTestAssociation({ name: `Harmonie ${uuidv4()}` });
  });

  describe('predictTicketSales - nagerekende uitkomsten', () => {
    it('rekent het gewogen gemiddelde uit zonder dagverkoop: 0,9 x historie + 0,1 x nu verkocht', () => {
      // Twee afgelopen concerten, allebei 50 van 100 verkocht. Omdat de
      // bezettingsgraad in beide gevallen gelijk is, is de seizoensfactor
      // precies 1,0 en valt die uit de som weg.
      maakHistorischConcert(vereniging.id, datumOverDagen(-400), 100, 50);
      maakHistorischConcert(vereniging.id, datumOverDagen(-300), 100, 50);

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      // Geen kaartverkoop-historie voor dit concert -> minder dan 3 dagen data,
      // dus gewichten 0,8 historie / 0,1 snelheid / 0,1 trend. De trend valt
      // terug op de historische voorspelling, dus effectief 0,9 x historie.
      //   historie   = 100 capaciteit x 0,50 bezetting x 1,0 seizoen = 50
      //   snelheid   = 10 nu verkocht + 0 per dag                    = 10
      //   voorspeld  = 0,8 x 50 + 0,1 x 10 + 0,1 x 50                = 46
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(46);
      expect(resultaat.predictedRevenue).toBe(46 * 20); // 920
      expect(resultaat.confidenceLevel).toBe('low'); // 2 concerten, 0 dagen verkoopdata
      expect(resultaat.factors).toContain('Historical average fill rate: 50%');
      expect(resultaat.factors).toContain('Current sales: 10/100 (10%)');
      // Concert ligt ~60 dagen vooruit, de dagvoorspelling stopt na 30 dagen.
      expect(resultaat.dailyPredictions).toHaveLength(30);
      expect(resultaat.dailyPredictions.every((d) => d.predictedSales <= 100)).toBe(true);
    });

    it('valt zonder enige historie terug op 70 procent bezetting', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      //   historie  = 100 x 0,70 x 1,0 = 70
      //   voorspeld = 0,8 x 70 + 0,1 x 10 + 0,1 x 70 = 64
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(64);
      expect(resultaat.predictedRevenue).toBe(64 * 20); // 1280
      expect(resultaat.factors).toContain('Limited historical data available');
      // Zonder historie hoort er geen bezettingsgraad in de onderbouwing te staan.
      expect(resultaat.factors.some((f) => f.startsWith('Historical average fill rate'))).toBe(false);
    });

    it('rekent met verkoopsnelheid en trend als er genoeg dagverkoop is', () => {
      // Concert van gisteren: dan is "dagen tot concert" gegarandeerd 0 en is
      // de trendvoorspelling exact na te rekenen zonder van de klok af te hangen.
      const concertId = maakConcert(vereniging.id, datumOverDagen(-1));
      const ticketTypeId = maakTicketType(concertId, 25, 80, 40);

      // 10 dagen lang 4 kaarten per dag.
      for (let i = 11; i >= 2; i--) {
        maakBestellingMetKaarten(concertId, ticketTypeId, datumOverDagen(-i), 4, 'paid');
      }

      // Vijf andere afgelopen concerten met dezelfde bezetting 40/80 = 0,50.
      // Het concert zelf telt ook mee in de historie (het ligt in het verleden)
      // en heeft dezelfde bezetting, dus het gemiddelde blijft 0,50 en de
      // seizoensfactor blijft 1,0.
      for (let i = 1; i <= 5; i++) {
        maakHistorischConcert(vereniging.id, datumOverDagen(-100 * i), 80, 40, 25);
      }

      //   snelheid    = 28 kaarten in de laatste 7 dagen / 7 = 4,0 per dag
      //   regressie   = y = 4x + 4 op cumulatief 4..40, dus R2 = 1,00
      //   trend       = 4 x (10 dagen + 0 resterend) + 4 = 44
      //   historie    = 80 x 0,50 x 1,0                   = 40
      //   snelheid    = 40 nu verkocht + 4 x 0 dagen      = 40
      //   voorspeld   = 0,4 x 40 + 0,3 x 40 + 0,3 x 44    = 41,2 -> 41
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Days until concert: 0');
      expect(resultaat.factors).toContain('Current sales velocity: 4.0 tickets/day');
      expect(resultaat.factors).toContain('Strong sales trend detected (R2: 1.00)');
      expect(resultaat.predictedTotalSales).toBe(41);
      expect(resultaat.predictedRevenue).toBe(41 * 25); // 1025
      // 6 historische concerten en 10 dagen verkoopdata -> hoogste vertrouwen.
      expect(resultaat.confidenceLevel).toBe('high');
      // Het concert is geweest, dus er valt niets meer per dag te voorspellen.
      expect(resultaat.dailyPredictions).toEqual([]);
    });

    it('gebruikt de middelste gewichtenverdeling bij drie tot zes dagen verkoopdata', () => {
      // Alle concerten in hetzelfde seizoen: dan is de seizoensfactor precies
      // 1,0 ook al verschillen de bezettingsgraden, en blijft de weging zelf
      // over om na te rekenen.
      const doeldatum = datumOverDagen(-1);
      const seizoen = seizoenVanMaand(new Date(doeldatum).getMonth() + 1);

      const concertId = maakConcert(vereniging.id, doeldatum);
      const ticketTypeId = maakTicketType(concertId, 20, 100, 24);

      // Vier magere dagen en dan een uitschieter: de trend past minder goed.
      const verkoopPerDag = [1, 1, 1, 1, 20];
      verkoopPerDag.forEach((aantal, i) => {
        maakBestellingMetKaarten(concertId, ticketTypeId, datumOverDagen(-6 + i), aantal, 'paid');
      });

      for (let jaar = 2; jaar <= 4; jaar++) {
        maakHistorischConcert(vereniging.id, datumInSeizoen(seizoen, jaar, 12), 100, 80);
      }

      //   snelheid   = 24 kaarten / 5 dagen                   = 4,8 per dag
      //   regressie  = y = 4,8x - 2,8 op cumulatief 1,2,3,4,24 ; R2 = 0,61
      //   trend      = 4,8 x (5 dagen + 0 resterend) - 2,8    = 21,2
      //   bezetting  = (0,80 + 0,80 + 0,80 + 0,24) / 4        = 0,66
      //   historie   = 100 x 0,66 x 1,0                       = 66
      //   voorspeld  = 0,5 x 66 + 0,25 x 24 + 0,25 x 21,2     = 44,3 -> 44
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Current sales velocity: 4.8 tickets/day');
      expect(resultaat.factors).toContain('Moderate sales trend (R2: 0.61)');
      expect(resultaat.factors).toContain('Historical average fill rate: 66%');
      expect(resultaat.predictedTotalSales).toBe(44);
      expect(resultaat.predictedRevenue).toBe(44 * 20); // 880
      // Vier historische concerten maar maar vijf dagen verkoopdata.
      expect(resultaat.confidenceLevel).toBe('medium');
    });

    it('telt alleen betaalde bestellingen mee in de verkoopsnelheid', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(-1));
      const ticketTypeId = maakTicketType(concertId, 25, 80, 40);

      for (let i = 11; i >= 2; i--) {
        maakBestellingMetKaarten(concertId, ticketTypeId, datumOverDagen(-i), 4, 'paid');
      }
      // Een openstaande bestelling met tien kaarten op de laatste dag. Zou die
      // meetellen, dan schieten snelheid en trend omhoog en komt er een ander
      // getal uit dan de 41 hierboven.
      maakBestellingMetKaarten(concertId, ticketTypeId, datumOverDagen(-2), 10, 'pending');

      for (let i = 1; i <= 5; i++) {
        maakHistorischConcert(vereniging.id, datumOverDagen(-100 * i), 80, 40, 25);
      }

      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Current sales velocity: 4.0 tickets/day');
      expect(resultaat.predictedTotalSales).toBe(41);
    });
  });

  describe('predictTicketSales - seizoenscorrectie', () => {
    it('middelt per seizoen, niet per concert, en geeft factor 1,0 als het doelseizoen ontbreekt', () => {
      const doeldatum = datumOverDagen(60);
      const doelSeizoen = seizoenVanMaand(new Date(doeldatum).getMonth() + 1);
      const andere = (['winter', 'spring', 'summer', 'fall'] as Seizoen[]).filter((s) => s !== doelSeizoen);

      // Twee concerten in seizoen A (bezetting 1,00 en 0,60) en één in seizoen B
      // (bezetting 0,20). Het doelseizoen heeft geen historie.
      maakHistorischConcert(vereniging.id, datumInSeizoen(andere[0], 2, 10), 100, 100);
      maakHistorischConcert(vereniging.id, datumInSeizoen(andere[0], 3, 15), 100, 60);
      maakHistorischConcert(vereniging.id, datumInSeizoen(andere[1], 2, 20), 100, 20);

      const concertId = maakConcert(vereniging.id, doeldatum);
      maakTicketType(concertId, 20, 100, 10);

      // Seizoensgemiddelden: A = (1,00 + 0,60) / 2 = 0,80 ; B = 0,20.
      // Totaalgemiddelde over de seizoenen = (0,80 + 0,20) / 2 = 0,50.
      // Het doelseizoen ontbreekt, dus valt de factor terug op 0,50 / 0,50 = 1,0.
      // De bezettingsgraad zelf middelt wel per concert: (1,00+0,60+0,20)/3 = 0,60.
      //   historie  = 100 x 0,60 x 1,0 = 60
      //   voorspeld = 0,8 x 60 + 0,1 x 10 + 0,1 x 60 = 55
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Historical average fill rate: 60%');
      expect(resultaat.factors.some((f) => f.startsWith('High season') || f.startsWith('Low season'))).toBe(false);
      expect(resultaat.predictedTotalSales).toBe(55);
    });

    it('schaalt de voorspelling af als het doelseizoen het slechter doet dan gemiddeld', () => {
      const doeldatum = datumOverDagen(60);
      const doelSeizoen = seizoenVanMaand(new Date(doeldatum).getMonth() + 1);
      const anderSeizoen = (['winter', 'spring', 'summer', 'fall'] as Seizoen[]).find((s) => s !== doelSeizoen)!;

      maakHistorischConcert(vereniging.id, datumInSeizoen(doelSeizoen, 2, 10), 100, 40);
      maakHistorischConcert(vereniging.id, datumInSeizoen(doelSeizoen, 3, 15), 100, 40);
      maakHistorischConcert(vereniging.id, datumInSeizoen(anderSeizoen, 2, 20), 100, 80);

      const concertId = maakConcert(vereniging.id, doeldatum);
      maakTicketType(concertId, 20, 100, 10);

      // Doelseizoen 0,40 ; ander seizoen 0,80 ; gemiddelde 0,60.
      // Factor = 0,40 / 0,60 = 0,6667 -> 33 procent onder gemiddeld.
      // Bezettingsgraad = (0,40 + 0,40 + 0,80) / 3 = 0,5333.
      //   historie  = 100 x 0,5333 x 0,6667 = 35,56
      //   voorspeld = 0,9 x 35,56 + 0,1 x 10 = 33
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Low season: 33% below average');
      expect(resultaat.predictedTotalSales).toBe(33);
    });

    it('schaalt de voorspelling op als het doelseizoen het beter doet dan gemiddeld', () => {
      const doeldatum = datumOverDagen(60);
      const doelSeizoen = seizoenVanMaand(new Date(doeldatum).getMonth() + 1);
      const anderSeizoen = (['winter', 'spring', 'summer', 'fall'] as Seizoen[]).find((s) => s !== doelSeizoen)!;

      maakHistorischConcert(vereniging.id, datumInSeizoen(doelSeizoen, 2, 10), 100, 80);
      maakHistorischConcert(vereniging.id, datumInSeizoen(doelSeizoen, 3, 15), 100, 80);
      maakHistorischConcert(vereniging.id, datumInSeizoen(anderSeizoen, 2, 20), 100, 40);

      const concertId = maakConcert(vereniging.id, doeldatum);
      maakTicketType(concertId, 20, 100, 10);

      // Doelseizoen 0,80 ; ander seizoen 0,40 ; gemiddelde 0,60.
      // Factor = 0,80 / 0,60 = 1,3333 -> 33 procent boven gemiddeld.
      // Bezettingsgraad = (0,80 + 0,80 + 0,40) / 3 = 0,6667.
      //   historie  = 100 x 0,6667 x 1,3333 = 88,89
      //   voorspeld = 0,9 x 88,89 + 0,1 x 10 = 81
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('High season: 33% above average');
      expect(resultaat.predictedTotalSales).toBe(81);
    });
  });

  describe('predictTicketSales - verenigingsgrens', () => {
    it('gebruikt de historie van een andere vereniging niet', () => {
      const andere = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      // Drie uitverkochte concerten bij de buren. Zouden die meetellen, dan
      // komt de bezettingsgraad op 1,00 en de voorspelling op 91 in plaats van 64.
      for (let i = 1; i <= 3; i++) {
        maakHistorischConcert(andere.id, datumOverDagen(-100 * i), 100, 100);
      }

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Limited historical data available');
      expect(resultaat.predictedTotalSales).toBe(64);
    });

    it('laat de kaartverkoop van een ander concert de snelheid niet beinvloeden', () => {
      // Het andere concert ligt in de toekomst, zodat het niet ook nog als
      // historie meetelt; het gaat hier puur om de dagverkoop.
      const anderConcert = maakConcert(vereniging.id, datumOverDagen(30));
      const anderType = maakTicketType(anderConcert, 20, 500, 200);
      for (let i = 11; i >= 2; i--) {
        maakBestellingMetKaarten(anderConcert, anderType, datumOverDagen(-i), 40, 'paid');
      }

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      const resultaat = predictTicketSales(concertId);

      // Geen eigen verkoopdata -> geen snelheidsregel in de onderbouwing.
      expect(resultaat.factors.some((f) => f.startsWith('Current sales velocity'))).toBe(false);
      expect(resultaat.predictedTotalSales).toBe(64);
    });
  });

  describe('predictTicketSales - zacht verwijderde concerten', () => {
    it('telt een zacht verwijderd concert niet mee in de historie', () => {
      // Eén uitverkocht concert in het verleden, maar het is verwijderd.
      maakHistorischConcert(vereniging.id, datumOverDagen(-200), 100, 100, 20, {
        deletedAt: '2026-01-01 10:00:00',
      });

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      // Zonder bruikbare historie hoort de standaard van 70 procent te gelden:
      // 0,8 x 70 + 0,1 x 10 + 0,1 x 70 = 64. Telt het verwijderde concert wel
      // mee, dan wordt de bezetting 100 procent en komt er 91 uit.
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(64);
      expect(resultaat.factors).toContain('Limited historical data available');
    });
  });

  describe('predictTicketSales - randgevallen', () => {
    it('geeft nul terug voor een concert dat niet bestaat', () => {
      const resultaat = predictTicketSales('bestaat-niet');

      expect(resultaat).toEqual({
        predictedTotalSales: 0,
        predictedRevenue: 0,
        confidenceLevel: 'low',
        factors: ['Concert not found'],
        dailyPredictions: [],
      });
    });

    it('geeft nul terug voor een concert zonder kaartsoorten', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));

      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(0);
      expect(resultaat.factors).toEqual(['No ticket types defined']);
    });

    it('geeft bij capaciteit nul een nette nul in plaats van NaN', () => {
      // Een kaartsoort met nul plaatsen: de deling verkocht/capaciteit is dan
      // 0/0. Zonder afvangen staat er "NaN%" in de onderbouwing.
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 10, 0, 0);

      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(0);
      expect(resultaat.predictedRevenue).toBe(0);
      expect(resultaat.factors.join(' ')).not.toContain('NaN');
      expect(resultaat.factors).toContain('Current sales: 0/0 (0%)');
    });

    it('voorspelt nooit minder dan er al verkocht is', () => {
      // Historie van 10 procent bezetting, maar dit concert is al bijna vol.
      for (let i = 1; i <= 3; i++) {
        maakHistorischConcert(vereniging.id, datumOverDagen(-100 * i), 100, 10);
      }

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 95);

      const resultaat = predictTicketSales(concertId);

      // 0,8 x 10 + 0,1 x 95 + 0,1 x 10 = 18,5, maar er zijn er al 95 verkocht.
      expect(resultaat.predictedTotalSales).toBe(95);
    });

    it('voorspelt nooit meer dan de capaciteit', () => {
      // Uitverkocht concert van gisteren met een stijgende trend: de
      // trendvoorspelling (44) ligt boven de capaciteit (40).
      const concertId = maakConcert(vereniging.id, datumOverDagen(-1));
      const ticketTypeId = maakTicketType(concertId, 20, 40, 40);
      for (let i = 11; i >= 2; i--) {
        maakBestellingMetKaarten(concertId, ticketTypeId, datumOverDagen(-i), 4, 'paid');
      }
      for (let i = 1; i <= 5; i++) {
        maakHistorischConcert(vereniging.id, datumOverDagen(-100 * i), 40, 40);
      }

      // 0,4 x 40 + 0,3 x 40 + 0,3 x 44 = 41,2, afgekapt op de 40 beschikbare plaatsen.
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(40);
      expect(resultaat.predictedRevenue).toBe(40 * 20);
    });

    it('negeert historische concerten zonder kaartsoorten', () => {
      // Concert zonder kaartsoorten: capaciteit 0. Zou dat als bezetting 0
      // meetellen, dan zakt het gemiddelde en verandert de voorspelling.
      maakConcert(vereniging.id, datumOverDagen(-250));
      maakHistorischConcert(vereniging.id, datumOverDagen(-200), 100, 50);
      maakHistorischConcert(vereniging.id, datumOverDagen(-150), 100, 50);

      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      const resultaat = predictTicketSales(concertId);

      expect(resultaat.factors).toContain('Historical average fill rate: 50%');
      expect(resultaat.predictedTotalSales).toBe(46);
    });

    it('telt meerdere kaartsoorten bij elkaar op voor capaciteit en gemiddelde prijs', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 10, 60, 6); // 60 plaatsen a 10 euro
      maakTicketType(concertId, 30, 40, 4); // 40 plaatsen a 30 euro

      // capaciteit 100, verkocht 10, gemiddelde prijs (10x60 + 30x40)/100 = 18
      //   historie  = 100 x 0,70 x 1,0 = 70
      //   voorspeld = 0,8 x 70 + 0,1 x 10 + 0,1 x 70 = 64
      const resultaat = predictTicketSales(concertId);

      expect(resultaat.predictedTotalSales).toBe(64);
      expect(resultaat.predictedRevenue).toBe(64 * 18); // 1152
      expect(resultaat.factors).toContain('Current sales: 10/100 (10%)');
    });
  });

  describe('calculateOptimalPricing', () => {
    it('laat de prijs staan bij gematigde vraag', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 10);

      const advies = calculateOptimalPricing(concertId);

      expect(advies.currentPrice).toBe(20);
      expect(advies.suggestedPrice).toBe(20);
      expect(advies.priceRange).toEqual({ min: 14, max: 26 });
      expect(advies.demandLevel).toBe('medium');
      expect(advies.reasoning).toContain('Moderate demand: 10% sold');
    });

    it('adviseert een hogere prijs bij meer dan 80 procent verkocht', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 90);

      // overvraag  = 0,90 - 0,90 + 0,10 = 0,10
      // opslag     = (0,10 / 0,5) x 20 x 0,5 = 2,00
      const advies = calculateOptimalPricing(concertId);

      expect(advies.demandLevel).toBe('high');
      expect(advies.suggestedPrice).toBe(22);
      expect(advies.reasoning).toContain('High demand: Over 80% sold');
    });

    it('adviseert korting bij lage vraag vlak voor het concert, begrensd door de bandbreedte', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(3));
      maakTicketType(concertId, 20, 100, 10);

      // tekort     = 0,60 - 0,10 = 0,50
      // korting    = (-0,50 / 0,5) x 20 x 0,3 = -6,00 -> prijs 14,00
      // de ondergrens van de bandbreedte is 20 x 0,7 = 14,00
      const advies = calculateOptimalPricing(concertId);

      expect(advies.demandLevel).toBe('low');
      expect(advies.suggestedPrice).toBe(14);
      expect(advies.priceRange.min).toBe(14);
      expect(advies.reasoning).toContain('Low demand: Under 30% sold with less than 2 weeks to go');
      expect(advies.reasoning).toContain('Last-minute pricing: consider additional discount');
    });

    it('ziet meer dan de helft verkocht met ruim een maand te gaan als hoge vraag', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 20, 100, 60);

      // overvraag = 0,60 - 0,90 + 0,10 = -0,20 -> opslag (-0,20/0,5) x 20 x 0,5 = -4
      const advies = calculateOptimalPricing(concertId);

      expect(advies.demandLevel).toBe('high');
      expect(advies.reasoning).toContain('Strong early sales: Over 50% sold with more than a month to go');
      expect(advies.suggestedPrice).toBe(16);
    });

    it('geeft geen NaN als een historisch concert nul kaarten verkocht', () => {
      // De historische gemiddelde prijs deelt omzet door verkochte kaarten.
      // Een afgelopen concert met plaatsen maar zonder verkoop geeft 0/0.
      maakHistorischConcert(vereniging.id, datumOverDagen(-200), 100, 0, 20, {
        concertType: 'kerst',
        venueType: 'kerk',
      });

      const concertId = maakConcert(vereniging.id, datumOverDagen(60), {
        concertType: 'kerst',
        venueType: 'kerk',
      });
      maakTicketType(concertId, 20, 100, 10);

      const advies = calculateOptimalPricing(concertId);

      expect(advies.reasoning.join(' ')).not.toContain('NaN');
      expect(advies.reasoning).toContain('Historical average price: EUR 0.00');
      expect(advies.reasoning).toContain('Historical fill rate: 0%');
      expect(advies.suggestedPrice).toBe(20);
    });

    it('rekent de historische gemiddelde prijs per verkochte kaart uit', () => {
      // 100 plaatsen, 50 verkocht a 20 euro: omzet 1000, gemiddelde prijs 20,00.
      maakHistorischConcert(vereniging.id, datumOverDagen(-200), 100, 50, 20, {
        concertType: 'kerst',
        venueType: 'kerk',
      });

      const concertId = maakConcert(vereniging.id, datumOverDagen(60), {
        concertType: 'kerst',
        venueType: 'kerk',
      });
      maakTicketType(concertId, 25, 100, 10);

      const advies = calculateOptimalPricing(concertId);

      expect(advies.reasoning).toContain('Historical average price: EUR 20.00');
      expect(advies.reasoning).toContain('Historical fill rate: 50%');
      expect(advies.currentPrice).toBe(25);
    });

    it('gebruikt alleen historie van dezelfde vereniging', () => {
      const andere = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      maakHistorischConcert(andere.id, datumOverDagen(-200), 100, 50, 99, {
        concertType: 'kerst',
        venueType: 'kerk',
      });

      const concertId = maakConcert(vereniging.id, datumOverDagen(60), {
        concertType: 'kerst',
        venueType: 'kerk',
      });
      maakTicketType(concertId, 20, 100, 10);

      const advies = calculateOptimalPricing(concertId);

      // Geen eigen historie -> geen regel over historische prijzen.
      expect(advies.reasoning.some((r) => r.startsWith('Historical average price'))).toBe(false);
    });

    it('geeft nul terug voor een onbekend concert of een concert zonder kaartsoorten', () => {
      expect(calculateOptimalPricing('bestaat-niet')).toEqual({
        currentPrice: 0,
        suggestedPrice: 0,
        priceRange: { min: 0, max: 0 },
        demandLevel: 'low',
        reasoning: ['Concert not found'],
      });

      const leegConcert = maakConcert(vereniging.id, datumOverDagen(60));
      expect(calculateOptimalPricing(leegConcert).reasoning).toEqual(['No ticket types defined']);
    });

    it('geeft bij capaciteit nul een prijs van nul in plaats van NaN', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 15, 0, 0);

      const advies = calculateOptimalPricing(concertId);

      expect(advies.currentPrice).toBe(0);
      expect(advies.suggestedPrice).toBe(0);
      expect(advies.priceRange).toEqual({ min: 0, max: 0 });
      expect(advies.reasoning.join(' ')).not.toContain('NaN');
    });
  });

  describe('getSalesPredictionSummary', () => {
    it('geeft de huidige stand naast voorspelling en prijsadvies', () => {
      const concertId = maakConcert(vereniging.id, datumOverDagen(60));
      maakTicketType(concertId, 10, 60, 6);
      maakTicketType(concertId, 30, 40, 4);

      const samenvatting = getSalesPredictionSummary(concertId);

      expect(samenvatting.currentStats.totalCapacity).toBe(100);
      expect(samenvatting.currentStats.totalSold).toBe(10);
      expect(samenvatting.currentStats.currentRevenue).toBe(6 * 10 + 4 * 30); // 180
      expect(samenvatting.currentStats.fillRate).toBe(0.1);
      expect(samenvatting.currentStats.daysUntilConcert).toBeGreaterThanOrEqual(59);
      expect(samenvatting.currentStats.daysUntilConcert).toBeLessThanOrEqual(61);
      expect(samenvatting.prediction.predictedTotalSales).toBe(64);
      expect(samenvatting.pricing.currentPrice).toBe(18);
    });

    it('geeft nullen voor een onbekend concert zonder te struikelen', () => {
      const samenvatting = getSalesPredictionSummary('bestaat-niet');

      expect(samenvatting.currentStats).toEqual({
        totalCapacity: 0,
        totalSold: 0,
        currentRevenue: 0,
        fillRate: 0,
        daysUntilConcert: 0,
      });
      expect(samenvatting.prediction.factors).toEqual(['Concert not found']);
    });
  });
});
