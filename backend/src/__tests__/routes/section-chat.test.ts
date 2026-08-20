/**
 * De sectiechat: per orkest en per instrument een kanaal.
 *
 * Dit bestand stond op nul en had helemaal geen verenigingsgrens. De
 * toegangscontrole vroeg alleen of de gebruiker het instrument van het kanaal
 * speelt - en de tabel instruments is gedeeld door alle verenigingen. Een
 * trompettist bij vereniging A kwam daarmee in de trompetgroep van vereniging
 * B: meelezen, meepraten, en als beheerder ook berichten verwijderen. Bij de
 * vastgepinde berichten stond zelfs helemaal geen controle.
 *
 * De tests hieronder leggen elk van die gaten apart vast, want dit is precies
 * het soort fout dat stilletjes terugkomt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import sectionChatRoutes from '../../routes/section-chat';
import { errorHandler } from '../../middleware/errorHandler';
import {
  addInstrumentToUser,
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestInstrument,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/section-chat', sectionChatRoutes);
app.use(errorHandler);

describe('sectiechat', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let orkest: TestOrchestra;
  let trompet: TestInstrument;
  let hoorn: TestInstrument;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Fanfare' });
    trompet = createTestInstrument({ name: `Trompet-${uuidv4().slice(0, 8)}` });
    hoorn = createTestInstrument({ name: `Hoorn-${uuidv4().slice(0, 8)}` });

    addInstrumentToUser(lid.id, trompet.id);
    addInstrumentToUser(beheerder.id, trompet.id);
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/section-chat${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakKanaal(orchestraId = orkest.id, instrumentId = trompet.id, naam = 'Trompetten'): string {
    const id = uuidv4();
    db.prepare('INSERT INTO section_chat_channels (id, orchestra_id, instrument_id, name) VALUES (?, ?, ?, ?)').run(
      id,
      orchestraId,
      instrumentId,
      naam,
    );
    return id;
  }

  /**
   * Een vereniging ernaast, met een eigen orkest en een eigen kanaal voor
   * hetzelfde instrument - het geval waar het misging.
   */
  function buurvereniging(): { kanaalId: string; lidToken: string; beheerderToken: string } {
    const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
    const andereOrkest = createTestOrchestra(andere.id, { name: 'Buurorkest' });
    const andereLid = createTestUser(andere.id, { email: `buur-${uuidv4()}@test.nl` });
    const andereBeheerder = createTestUser(andere.id, { email: `buurbeheer-${uuidv4()}@test.nl`, role: 'admin' });
    addInstrumentToUser(andereLid.id, trompet.id);
    addInstrumentToUser(andereBeheerder.id, trompet.id);

    return {
      kanaalId: maakKanaal(andereOrkest.id, trompet.id, 'Trompetten van de buren'),
      lidToken: generateTestToken(andereLid),
      beheerderToken: generateTestToken(andereBeheerder),
    };
  }

  async function stuurBericht(kanaalId: string, tekst: string, token = lidToken) {
    return als(token, 'post', `/channels/${kanaalId}/messages`).send({ content: tekst });
  }

  describe('kanalen', () => {
    it('geeft een lege lijst voor iemand zonder instrument', async () => {
      const zonderInstrument = createTestUser(vereniging.id, { email: `geen-${uuidv4()}@test.nl` });
      maakKanaal();

      const antwoord = await als(generateTestToken(zonderInstrument), 'get', '/channels');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('toont het kanaal van het eigen instrument', async () => {
      maakKanaal();

      const antwoord = await alsLid('get', '/channels');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ name: 'Trompetten', messageCount: 0, unreadCount: 0 });
      expect(antwoord.body[0].orchestra.name).toBe('Fanfare');
    });

    it('toont het kanaal van een instrument dat het lid niet speelt niet', async () => {
      maakKanaal(orkest.id, hoorn.id, 'Hoorns');

      expect((await alsLid('get', '/channels')).body).toEqual([]);
    });

    it('toont het kanaal van een andere vereniging niet', async () => {
      maakKanaal();
      buurvereniging();

      // Hier ging het mis: er werd alleen op instrument gefilterd, en dat is
      // een gedeelde tabel.
      const antwoord = await alsLid('get', '/channels');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Trompetten');
    });

    it('filtert op orkest', async () => {
      const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });
      maakKanaal();
      maakKanaal(tweedeOrkest.id, trompet.id, 'Trompetten slagwerkgroep');

      const antwoord = await alsLid('get', `/channels?orchestraId=${tweedeOrkest.id}`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Trompetten slagwerkgroep');
    });

    it('telt de berichten en de ongelezen berichten', async () => {
      const kanaalId = maakKanaal();
      await stuurBericht(kanaalId, 'Eerste', beheerderToken);
      await stuurBericht(kanaalId, 'Tweede', beheerderToken);

      const antwoord = await alsLid('get', '/channels');
      expect(antwoord.body[0]).toMatchObject({ messageCount: 2, unreadCount: 2 });
    });

    it('zet de ongelezen teller op nul zodra het lid het kanaal opent', async () => {
      const kanaalId = maakKanaal();
      await stuurBericht(kanaalId, 'Hallo', beheerderToken);
      await alsLid('get', `/channels/${kanaalId}/messages`);

      expect((await alsLid('get', '/channels')).body[0].unreadCount).toBe(0);
    });
  });

  describe('berichten lezen', () => {
    it('geeft de berichten in volgorde van oud naar nieuw', async () => {
      const kanaalId = maakKanaal();
      await stuurBericht(kanaalId, 'Eerste');
      await stuurBericht(kanaalId, 'Tweede');

      const antwoord = await alsLid('get', `/channels/${kanaalId}/messages`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.map((m: { content: string }) => m.content)).toEqual(['Eerste', 'Tweede']);
    });

    it('noemt de afzender', async () => {
      const kanaalId = maakKanaal();
      await stuurBericht(kanaalId, 'Hallo');

      const antwoord = await alsLid('get', `/channels/${kanaalId}/messages`);
      expect(antwoord.body[0].user).toMatchObject({ id: lid.id });
    });

    it('weigert een kanaal van een instrument dat je niet speelt', async () => {
      const kanaalId = maakKanaal(orkest.id, hoorn.id, 'Hoorns');
      expect((await alsLid('get', `/channels/${kanaalId}/messages`)).status).toBe(403);
    });

    it('weigert een kanaal van een andere vereniging', async () => {
      const buren = buurvereniging();
      await stuurBericht(buren.kanaalId, 'Vertrouwelijk overleg', buren.lidToken);

      const antwoord = await alsLid('get', `/channels/${buren.kanaalId}/messages`);
      expect(antwoord.status).toBe(403);
      expect(JSON.stringify(antwoord.body)).not.toContain('Vertrouwelijk');
    });

    it('weigert een kanaal dat niet bestaat', async () => {
      expect((await alsLid('get', `/channels/${uuidv4()}/messages`)).status).toBe(403);
    });
  });

  describe('berichten sturen', () => {
    it('stuurt een bericht', async () => {
      const kanaalId = maakKanaal();

      const antwoord = await stuurBericht(kanaalId, 'Zaterdag om half acht');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body).toMatchObject({ content: 'Zaterdag om half acht', isPinned: false, isEdited: false });
    });

    it('weigert een leeg bericht', async () => {
      const kanaalId = maakKanaal();
      expect((await stuurBericht(kanaalId, '   ')).status).toBe(400);
      expect((await als(lidToken, 'post', `/channels/${kanaalId}/messages`).send({})).status).toBe(400);
    });

    it('haalt witruimte om het bericht weg', async () => {
      const kanaalId = maakKanaal();
      const antwoord = await stuurBericht(kanaalId, '  Hallo  ');
      expect(antwoord.body.content).toBe('Hallo');
    });

    it('stuurt niets naar een kanaal van een andere vereniging', async () => {
      const buren = buurvereniging();

      const antwoord = await stuurBericht(buren.kanaalId, 'Ik hoor hier niet');
      expect(antwoord.status).toBe(403);

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM section_chat_messages WHERE channel_id = ?')
        .get(buren.kanaalId) as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('reageert op een eerder bericht', async () => {
      const kanaalId = maakKanaal();
      const eerste = await stuurBericht(kanaalId, 'Wie rijdt er?');

      const antwoord = await als(beheerderToken, 'post', `/channels/${kanaalId}/messages`).send({
        content: 'Ik',
        replyToId: eerste.body.id,
      });
      expect(antwoord.status).toBe(201);

      const berichten = await alsLid('get', `/channels/${kanaalId}/messages`);
      const reactie = berichten.body.find((m: { content: string }) => m.content === 'Ik');
      expect(reactie.replyTo).toMatchObject({ content: 'Wie rijdt er?' });
    });

    it('weigert een reactie op een bericht uit een ander kanaal', async () => {
      const kanaalId = maakKanaal();
      const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Tweede' });
      const anderKanaal = maakKanaal(tweedeOrkest.id, trompet.id, 'Ander');
      const elders = await stuurBericht(anderKanaal, 'Elders');

      const antwoord = await als(lidToken, 'post', `/channels/${kanaalId}/messages`).send({
        content: 'Reactie',
        replyToId: elders.body.id,
      });
      expect(antwoord.status).toBe(404);
    });
  });

  describe('bewerken en verwijderen', () => {
    it('laat het lid zijn eigen bericht bewerken', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Half acht');

      const antwoord = await alsLid('patch', `/messages/${bericht.body.id}`).send({ content: 'Kwart voor acht' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const berichten = await alsLid('get', `/channels/${kanaalId}/messages`);
      expect(berichten.body[0]).toMatchObject({ content: 'Kwart voor acht', isEdited: true });
    });

    it('laat niemand het bericht van een ander bewerken', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Van mij');

      expect((await alsBeheerder('patch', `/messages/${bericht.body.id}`).send({ content: 'Gekaapt' })).status).toBe(
        403,
      );
    });

    it('bewerkt geen bericht uit een andere vereniging', async () => {
      const buren = buurvereniging();
      const bericht = await stuurBericht(buren.kanaalId, 'Van de buren', buren.lidToken);

      expect((await alsLid('patch', `/messages/${bericht.body.id}`).send({ content: 'Gekaapt' })).status).toBe(404);
    });

    it('laat het lid zijn eigen bericht verwijderen', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Weg hiermee');

      expect((await alsLid('delete', `/messages/${bericht.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/channels/${kanaalId}/messages`)).body).toEqual([]);
    });

    it('laat een beheerder het bericht van een lid verwijderen', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Ongepast');

      expect((await alsBeheerder('delete', `/messages/${bericht.body.id}`)).status).toBe(200);
    });

    it('laat een beheerder van een andere vereniging niets verwijderen', async () => {
      const buren = buurvereniging();
      const bericht = await stuurBericht(buren.kanaalId, 'Van de buren', buren.lidToken);

      // Hier ging het mis: verwijderen stond open voor elke beheerder, van
      // welke vereniging dan ook.
      expect((await alsBeheerder('delete', `/messages/${bericht.body.id}`)).status).toBe(404);

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM section_chat_messages WHERE id = ?')
        .get(bericht.body.id) as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('geeft 404 voor een bericht dat niet bestaat', async () => {
      expect((await alsLid('delete', `/messages/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('vastpinnen', () => {
    it('laat een beheerder een bericht vastpinnen en weer losmaken', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Belangrijk');

      const vast = await alsBeheerder('post', `/messages/${bericht.body.id}/pin`);
      expect(vast.status, JSON.stringify(vast.body)).toBe(200);
      expect(vast.body.pinned).toBe(true);

      const los = await alsBeheerder('post', `/messages/${bericht.body.id}/pin`);
      expect(los.body.pinned).toBe(false);
    });

    it('laat een gewoon lid niets vastpinnen', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Belangrijk');

      expect((await alsLid('post', `/messages/${bericht.body.id}/pin`)).status).toBe(403);
    });

    it('laat een beheerder van een andere vereniging niets vastpinnen', async () => {
      const buren = buurvereniging();
      const bericht = await stuurBericht(buren.kanaalId, 'Van de buren', buren.lidToken);

      expect((await alsBeheerder('post', `/messages/${bericht.body.id}/pin`)).status).toBe(404);
    });

    it('geeft de vastgepinde berichten van een kanaal', async () => {
      const kanaalId = maakKanaal();
      const bericht = await stuurBericht(kanaalId, 'Belangrijk');
      await stuurBericht(kanaalId, 'Gewoon');
      await alsBeheerder('post', `/messages/${bericht.body.id}/pin`);

      const antwoord = await alsLid('get', `/channels/${kanaalId}/pinned`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].content).toBe('Belangrijk');
    });

    it('geeft de vastgepinde berichten van een andere vereniging niet', async () => {
      const buren = buurvereniging();
      const bericht = await stuurBericht(buren.kanaalId, 'Vertrouwelijk', buren.lidToken);
      await als(buren.beheerderToken, 'post', `/messages/${bericht.body.id}/pin`);

      // Op deze route stond helemaal geen controle: elke ingelogde gebruiker
      // kon de vastgepinde berichten van elk kanaal opvragen.
      const antwoord = await alsLid('get', `/channels/${buren.kanaalId}/pinned`);
      expect(antwoord.status).toBe(403);
      expect(JSON.stringify(antwoord.body)).not.toContain('Vertrouwelijk');
    });

    it('geeft de vastgepinde berichten niet aan wie het instrument niet speelt', async () => {
      const kanaalId = maakKanaal(orkest.id, hoorn.id, 'Hoorns');
      expect((await alsLid('get', `/channels/${kanaalId}/pinned`)).status).toBe(403);
    });
  });

  describe('kanalen aanmaken', () => {
    it('maakt een kanaal per orkest en instrument', async () => {
      const antwoord = await alsBeheerder('post', '/channels/ensure');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const kanalen = db
        .prepare('SELECT COUNT(*) AS n FROM section_chat_channels WHERE orchestra_id = ?')
        .get(orkest.id) as { n: number };
      expect(kanalen.n).toBeGreaterThan(0);
    });

    it('maakt bij een tweede keer niets dubbel aan', async () => {
      await alsBeheerder('post', '/channels/ensure');
      const eerste = db.prepare('SELECT COUNT(*) AS n FROM section_chat_channels').get() as { n: number };

      const tweede = await alsBeheerder('post', '/channels/ensure');
      expect(tweede.body.message).toContain('0 kanalen');

      const na = db.prepare('SELECT COUNT(*) AS n FROM section_chat_channels').get() as { n: number };
      expect(na.n).toBe(eerste.n);
    });

    it('maakt alleen kanalen voor de eigen vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereOrkest = createTestOrchestra(andere.id, { name: 'Buurorkest' });

      await alsBeheerder('post', '/channels/ensure');

      const kanalen = db
        .prepare('SELECT COUNT(*) AS n FROM section_chat_channels WHERE orchestra_id = ?')
        .get(andereOrkest.id) as { n: number };
      expect(kanalen.n).toBe(0);
    });

    it('laat aanmaken alleen aan een beheerder over', async () => {
      expect((await alsLid('post', '/channels/ensure')).status).toBe(403);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect((await request(app).get('/api/section-chat/channels')).status).toBe(401);
    expect((await request(app).get(`/api/section-chat/channels/${uuidv4()}/pinned`)).status).toBe(401);
  });
});
