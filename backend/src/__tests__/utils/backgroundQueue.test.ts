/**
 * De achtergrondwachtrij is de plek waar fouten stil kunnen blijven.
 *
 * Een taak draait zonder dat er iemand op wacht: er is geen aanvrager die een
 * foutmelding terugkrijgt. Gaat er iets mis, dan is het enige dat de gebruiker
 * merkt dat zijn PDF-samenvoeging of export nooit klaar komt. Deze tests leggen
 * daarom vast wat de rij belooft: de volgorde waarin taken starten, dat een
 * taak die gooit de rest van de rij niet meesleurt, hoe vaak er opnieuw
 * geprobeerd wordt en waar die grens precies ligt.
 *
 * De tests maken steeds een eigen BackgroundQueue in plaats van de gedeelde
 * singleton te gebruiken: die singleton heeft een vaste hertekst-vertraging van
 * twee seconden en wordt door de hele applicatie gedeeld, waardoor tests elkaar
 * zouden kunnen beinvloeden.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../setup';
import { BackgroundQueue, JOB_TYPES, type Job } from '../../utils/backgroundQueue';

/**
 * Wacht tot er `aantal` taken definitief afgerond zijn (geslaagd of mislukt).
 *
 * Een taak die opnieuw geprobeerd wordt zendt tussentijds niets uit, dus deze
 * teller loopt alleen op bij een eindresultaat. De luisteraars moeten worden
 * aangehangen voor het aanbieden: een taak zonder handler mislukt al tijdens
 * enqueue() zelf.
 */
function wachtOpAfronding(queue: BackgroundQueue, aantal: number): Promise<Job[]> {
  return new Promise((resolve) => {
    const afgerond: Job[] = [];
    const tel = (job: Job) => {
      afgerond.push(job);
      if (afgerond.length >= aantal) resolve(afgerond);
    };
    queue.on('job:completed', tel);
    queue.on('job:failed', tel);
  });
}

/** Geeft de beurt terug aan de gebeurtenislus, zodat wachtende taken verder kunnen. */
function tik(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wacht tot de klok aantoonbaar verder staat.
 *
 * `cleanup(0)` gooit weg wat `now - completedAt > 0` is, dus er moet echt een
 * hele milliseconde voorbij zijn. Een `setTimeout(0)` garandeert dat niet: op
 * een snelle of onbelaste machine keert die terug binnen dezelfde milliseconde,
 * en dan ruimt cleanup niets op. Zo viel deze test om zodra de suite parallel
 * ging draaien - niet door het parallellisme zelf, maar doordat de timing
 * anders uitpakte en de aanname zichtbaar werd.
 *
 * Wachten tot Date.now() echt verspringt is deterministisch: geen vaste
 * wachttijd die op de ene machine te kort en op de andere verspild is.
 */
async function wachtOpKlokTik(): Promise<void> {
  const start = Date.now();
  while (Date.now() === start) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe('BackgroundQueue', () => {
  let queue: BackgroundQueue;

  beforeEach(() => {
    // retryDelay 0 houdt de hertesten snel; de vertraging zelf wordt apart
    // getest via het aantal pogingen, niet via de kloktijd.
    queue = new BackgroundQueue({ maxConcurrent: 1, maxRetries: 3, retryDelay: 0 });
  });

  describe('volgorde en doorstroming', () => {
    it('start taken in de volgorde waarin ze zijn aangeboden', async () => {
      const volgorde: string[] = [];
      queue.registerHandler('test', async (data: unknown) => {
        volgorde.push((data as { naam: string }).naam);
        return true;
      });

      const klaar = wachtOpAfronding(queue, 3);
      queue.enqueue('test', { naam: 'eerste' });
      queue.enqueue('test', { naam: 'tweede' });
      queue.enqueue('test', { naam: 'derde' });
      await klaar;

      expect(volgorde).toEqual(['eerste', 'tweede', 'derde']);
    });

    it('laat de rij doorlopen nadat een taak heeft gegooid', async () => {
      const uitgevoerd: string[] = [];
      queue.registerHandler('test', async (data: unknown) => {
        const naam = (data as { naam: string }).naam;
        uitgevoerd.push(naam);
        if (naam === 'stuk') throw new Error('deze taak gaat kapot');
        return true;
      });

      const klaar = wachtOpAfronding(queue, 3);
      queue.enqueue('test', { naam: 'voor' }, { maxRetries: 1 });
      queue.enqueue('test', { naam: 'stuk' }, { maxRetries: 1 });
      queue.enqueue('test', { naam: 'na' }, { maxRetries: 1 });
      await klaar;

      // De taak na de kapotte taak is gewoon uitgevoerd: een uitzondering in
      // een handler mag de rij niet stilzetten.
      expect(uitgevoerd).toEqual(['voor', 'stuk', 'na']);
      const stats = queue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
    });

    it('verwerkt een lege rij zonder te klagen', async () => {
      // Er is niets aangeboden: geen taken, geen fouten, geen werk.
      expect(queue.getStats()).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
      expect(queue.cleanup(0)).toBe(0);
      await tik();
      expect(queue.getStats().total).toBe(0);
    });

    it('geeft undefined voor een taak die niet bestaat', () => {
      expect(queue.getJob('bestaat-niet')).toBeUndefined();
    });
  });

  describe('dubbel aanbieden', () => {
    it('voert dezelfde taak twee keer uit als hij twee keer wordt aangeboden', async () => {
      // De rij ontdubbelt bewust niet: enqueue() maakt elke keer een nieuwe id
      // aan. Twee keer hetzelfde aanbieden is dus twee keer werk. Wie
      // ontdubbeling wil moet dat bij de aanroeper regelen - deze test legt
      // vast dat de rij die belofte niet doet, zodat een aanroeper er niet
      // per ongeluk op vertrouwt.
      const handler = vi.fn(async () => 'klaar');
      queue.registerHandler('test', handler);

      const klaar = wachtOpAfronding(queue, 2);
      const eerste = queue.enqueue('test', { zelfde: 'lading' });
      const tweede = queue.enqueue('test', { zelfde: 'lading' });
      await klaar;

      expect(eerste).not.toBe(tweede);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(queue.getStats().completed).toBe(2);
    });

    it('geeft elke aangeboden taak een eigen id met het type als voorvoegsel', () => {
      queue.registerHandler(JOB_TYPES.PDF_MERGE, async () => true);
      const id = queue.enqueue(JOB_TYPES.PDF_MERGE, {});
      expect(id.startsWith(`${JOB_TYPES.PDF_MERGE}-`)).toBe(true);
      expect(queue.getJob(id)?.type).toBe(JOB_TYPES.PDF_MERGE);
    });
  });

  describe('gelijktijdigheid', () => {
    it('draait nooit meer taken tegelijk dan maxConcurrent', async () => {
      const parallel = new BackgroundQueue({ maxConcurrent: 2, maxRetries: 1, retryDelay: 0 });
      let bezig = 0;
      let hoogsteBezet = 0;

      parallel.registerHandler('traag', async () => {
        bezig++;
        hoogsteBezet = Math.max(hoogsteBezet, bezig);
        await tik();
        bezig--;
        return true;
      });

      const klaar = wachtOpAfronding(parallel, 5);
      for (let i = 0; i < 5; i++) parallel.enqueue('traag', { i });
      await klaar;

      expect(hoogsteBezet).toBe(2);
      expect(parallel.getStats().completed).toBe(5);
    });

    it('houdt de rest van de rij vast zolang de eerste taak nog loopt', async () => {
      let losmaken: (() => void) | undefined;
      const handler = vi.fn(async () => {
        await new Promise<void>((resolve) => {
          losmaken = resolve;
        });
        return true;
      });
      queue.registerHandler('test', handler);

      const klaar = wachtOpAfronding(queue, 2);
      queue.enqueue('test', { n: 1 });
      const tweedeId = queue.enqueue('test', { n: 2 });
      await tik();

      // maxConcurrent is 1: de tweede taak staat nog te wachten.
      expect(handler).toHaveBeenCalledTimes(1);
      expect(queue.getJob(tweedeId)?.status).toBe('pending');

      losmaken?.();
      await tik();
      losmaken?.();
      await klaar;
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('hertesten en de grens daarvan', () => {
    it('probeert het maximaal maxRetries keer en meldt de taak dan mislukt', async () => {
      // Let op de betekenis: het veld heet maxRetries, maar de code vergelijkt
      // retryCount < maxRetries waarbij retryCount begint te tellen bij de
      // eerste mislukking. Bij maxRetries 3 zijn dat drie POGINGEN in totaal,
      // dus twee hertesten - niet drie hertesten bovenop de eerste poging.
      const handler = vi.fn(async () => {
        throw new Error('blijft mislukken');
      });
      queue.registerHandler('test', handler);

      const klaar = wachtOpAfronding(queue, 1);
      const id = queue.enqueue('test', {}, { maxRetries: 3 });
      const [job] = await klaar;

      expect(handler).toHaveBeenCalledTimes(3);
      expect(job.id).toBe(id);
      expect(job.status).toBe('failed');
      expect(job.error).toBe('blijft mislukken');
      expect(job.retryCount).toBe(3);
      expect(job.completedAt).toBeInstanceOf(Date);
    });

    it('probeert het bij maxRetries 1 precies een keer', async () => {
      const handler = vi.fn(async () => {
        throw new Error('meteen mis');
      });
      queue.registerHandler('test', handler);

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {}, { maxRetries: 1 });
      await klaar;

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('probeert het bij maxRetries 0 ook precies een keer', async () => {
      // Nul hertesten kan niet leiden tot nul pogingen: de eerste poging is al
      // gedaan voordat er geteld wordt.
      const handler = vi.fn(async () => {
        throw new Error('meteen mis');
      });
      queue.registerHandler('test', handler);

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {}, { maxRetries: 0 });
      const [job] = await klaar;

      expect(handler).toHaveBeenCalledTimes(1);
      expect(job.status).toBe('failed');
    });

    it('meldt de taak geslaagd zodra een hertest lukt', async () => {
      let pogingen = 0;
      queue.registerHandler('test', async () => {
        pogingen++;
        if (pogingen < 2) throw new Error('eerste keer mis');
        return 'gelukt bij poging twee';
      });

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {}, { maxRetries: 3 });
      const [job] = await klaar;

      expect(pogingen).toBe(2);
      expect(job.status).toBe('completed');
      expect(job.result).toBe('gelukt bij poging twee');
      expect(job.retryCount).toBe(1);
      expect(job.error).toBeUndefined();
    });

    it('valt terug op maxRetries van de rij als de taak niets opgeeft', async () => {
      const eigen = new BackgroundQueue({ maxConcurrent: 1, maxRetries: 2, retryDelay: 0 });
      const handler = vi.fn(async () => {
        throw new Error('mis');
      });
      eigen.registerHandler('test', handler);

      const klaar = wachtOpAfronding(eigen, 1);
      eigen.enqueue('test', {});
      await klaar;

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('maakt van een geworpen waarde die geen Error is toch een leesbare melding', async () => {
      queue.registerHandler('test', async () => {
        // Sommige bibliotheken gooien een string of een object in plaats van
        // een Error. Dat mag niet leiden tot "undefined" in het foutveld.
        throw 'kapot als tekst';
      });

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {}, { maxRetries: 1 });
      const [job] = await klaar;

      expect(job.error).toBe('kapot als tekst');
    });
  });

  describe('ontbrekende handler', () => {
    it('laat een taak zonder handler direct mislukken in plaats van te blijven hangen', async () => {
      const klaar = wachtOpAfronding(queue, 1);
      const id = queue.enqueue('type-zonder-handler', {});
      const [job] = await klaar;

      expect(job.id).toBe(id);
      expect(job.status).toBe('failed');
      expect(job.error).toBe('No handler registered for job type: type-zonder-handler');
    });

    it('houdt geen plek bezet met een taak zonder handler', async () => {
      // Een taak zonder handler komt nooit in `processing` terecht. Zou dat wel
      // gebeuren, dan zou hij een van de maxConcurrent plekken voorgoed
      // bezetten en de rij vastzetten. Deze test bewijst dat de rij daarna
      // gewoon doorwerkt.
      const handler = vi.fn(async () => true);
      queue.registerHandler('werkt', handler);

      const klaar = wachtOpAfronding(queue, 3);
      queue.enqueue('onbekend', {});
      queue.enqueue('onbekend', {});
      queue.enqueue('werkt', {});
      await klaar;

      expect(handler).toHaveBeenCalledTimes(1);
      expect(queue.getStats()).toMatchObject({ completed: 1, failed: 2 });
    });

    it('helpt een handler die te laat wordt aangemeld niet meer', async () => {
      // De taak is al mislukt op het moment dat enqueue() terugkeert; hem
      // alsnog van een handler voorzien haalt hem niet terug.
      const id = queue.enqueue('laat', {});
      expect(queue.getJob(id)?.status).toBe('failed');

      const handler = vi.fn(async () => true);
      queue.registerHandler('laat', handler);
      await tik();

      expect(handler).not.toHaveBeenCalled();
      expect(queue.getJob(id)?.status).toBe('failed');
    });
  });

  describe('gebeurtenissen', () => {
    it('meldt aanbieden, starten en afronden in die volgorde', async () => {
      const gemeld: string[] = [];
      queue.on('job:enqueued', () => gemeld.push('enqueued'));
      queue.on('job:started', () => gemeld.push('started'));
      queue.on('job:completed', () => gemeld.push('completed'));
      queue.registerHandler('test', async () => true);

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {});
      await klaar;

      expect(gemeld).toEqual(['enqueued', 'started', 'completed']);
    });

    it('meldt job:failed maar een keer, ook na hertesten', async () => {
      const mislukt = vi.fn();
      queue.on('job:failed', mislukt);
      queue.registerHandler('test', async () => {
        throw new Error('mis');
      });

      const klaar = wachtOpAfronding(queue, 1);
      queue.enqueue('test', {}, { maxRetries: 3 });
      await klaar;
      await tik();

      expect(mislukt).toHaveBeenCalledTimes(1);
    });
  });

  describe('overzicht en opruimen', () => {
    it('telt taken per status', async () => {
      queue.registerHandler('goed', async () => true);
      queue.registerHandler('fout', async () => {
        throw new Error('mis');
      });

      const klaar = wachtOpAfronding(queue, 3);
      queue.enqueue('goed', {});
      queue.enqueue('goed', {});
      queue.enqueue('fout', {}, { maxRetries: 1 });
      await klaar;

      expect(queue.getStats()).toEqual({
        pending: 0,
        processing: 0,
        completed: 2,
        failed: 1,
        total: 3,
      });
    });

    it('filtert taken op type', async () => {
      queue.registerHandler(JOB_TYPES.PDF_MERGE, async () => true);
      queue.registerHandler(JOB_TYPES.EXPORT_DATA, async () => true);

      const klaar = wachtOpAfronding(queue, 3);
      queue.enqueue(JOB_TYPES.PDF_MERGE, { a: 1 });
      queue.enqueue(JOB_TYPES.PDF_MERGE, { a: 2 });
      queue.enqueue(JOB_TYPES.EXPORT_DATA, { a: 3 });
      await klaar;

      expect(queue.getJobsByType(JOB_TYPES.PDF_MERGE)).toHaveLength(2);
      expect(queue.getJobsByType(JOB_TYPES.EXPORT_DATA)).toHaveLength(1);
      expect(queue.getJobsByType('niet-gebruikt')).toHaveLength(0);
    });

    it('ruimt afgeronde taken op die ouder zijn dan de opgegeven leeftijd', async () => {
      queue.registerHandler('goed', async () => true);
      queue.registerHandler('fout', async () => {
        throw new Error('mis');
      });

      const klaar = wachtOpAfronding(queue, 2);
      queue.enqueue('goed', {});
      queue.enqueue('fout', {}, { maxRetries: 1 });
      await klaar;

      // maxAge 0: alles wat af is en ook maar iets ouder is dan nu mag weg.
      // De klok moet daarvoor aantoonbaar verder staan dan completedAt.
      await wachtOpKlokTik();
      expect(queue.cleanup(0)).toBe(2);
      expect(queue.getStats().total).toBe(0);
    });

    it('laat verse en nog lopende taken met rust bij het opruimen', async () => {
      let losmaken: (() => void) | undefined;
      queue.registerHandler('traag', async () => {
        await new Promise<void>((resolve) => {
          losmaken = resolve;
        });
        return true;
      });

      queue.enqueue('traag', {});
      await tik();
      expect(queue.getStats().processing).toBe(1);

      // Een lopende taak is niet 'completed' of 'failed' en mag dus nooit
      // worden weggegooid, hoe agressief de opruiming ook is ingesteld.
      expect(queue.cleanup(0)).toBe(0);
      expect(queue.getStats().total).toBe(1);

      const klaar = wachtOpAfronding(queue, 1);
      losmaken?.();
      await klaar;

      // Vers afgerond: valt binnen het uur en blijft dus staan.
      expect(queue.cleanup(3600000)).toBe(0);
      expect(queue.getStats().total).toBe(1);
    });
  });
});
