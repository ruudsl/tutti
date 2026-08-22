/**
 * Tests voor de mailingcampagnes-api.
 *
 * De functies in email-campaigns.ts zetten een pad in elkaar, geven een body
 * mee en leveren `response.data` terug. Daarom wordt hier op het pad, de
 * methode, de body en de queryreeks getoetst - een typefout daarin geeft geen
 * foutmelding maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/email-campaigns.ts (gemount op /api/email-campaigns).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  getEmailCampaigns,
  getEmailCampaign,
  createEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
  previewRecipients,
  scheduleCampaign,
  cancelCampaign,
  sendCampaign,
  sendTestEmail,
  getCampaignAttachments,
  uploadCampaignAttachment,
  deleteCampaignAttachment,
  getCampaignRecipients,
} from '../email-campaigns';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// SJABLONEN
// ===========================================

describe('sjablonen', () => {
  it('getEmailTemplates bevraagt /email-campaigns/templates', async () => {
    antwoordMet([{ id: 'tpl1', name: 'Nieuwsbrief' }]);
    const sjablonen = await getEmailTemplates();

    expect(laatsteVerzoek().methode).toBe('get');
    // De templates-route staat in de backend voor /:id, dus 'templates' hoort
    // niet als campagne-id gelezen te worden.
    expect(laatsteVerzoek().pad).toBe('/email-campaigns/templates');
    expect(sjablonen).toHaveLength(1);
  });

  it('getEmailTemplates geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getEmailTemplates()).resolves.toEqual([]);
  });

  it('getEmailTemplate haalt een sjabloon op via het id', async () => {
    antwoordMet({ id: 'tpl1', name: 'Nieuwsbrief', subject: 'Hoi', bodyHtml: '<p>Hoi</p>' });
    const sjabloon = await getEmailTemplate('tpl1');

    expect(laatsteVerzoek().pad).toBe('/email-campaigns/templates/tpl1');
    expect(sjabloon.subject).toBe('Hoi');
  });

  it('createEmailTemplate post het sjabloon', async () => {
    antwoordMet({ id: 'tpl9', message: 'Sjabloon aangemaakt' });
    await createEmailTemplate({
      name: 'Uitnodiging',
      subject: 'Kom je ook?',
      bodyHtml: '<p>Kom je ook?</p>',
      bodyText: 'Kom je ook?',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/templates');
    expect(verzoek.body).toEqual({
      name: 'Uitnodiging',
      subject: 'Kom je ook?',
      bodyHtml: '<p>Kom je ook?</p>',
      bodyText: 'Kom je ook?',
    });
  });

  it('updateEmailTemplate gebruikt PUT op het sjabloon', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateEmailTemplate('tpl1', { subject: 'Nieuw onderwerp' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/email-campaigns/templates/tpl1');
    expect(verzoek.body).toEqual({ subject: 'Nieuw onderwerp' });
  });

  it('deleteEmailTemplate verwijdert een sjabloon', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteEmailTemplate('tpl1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/email-campaigns/templates/tpl1');
  });

  it('laat een 403 door wanneer een systeemsjabloon niet verwijderd mag worden', async () => {
    antwoordMetFout(403, { error: 'Systeemsjablonen kunnen niet verwijderd worden.' });

    await expect(deleteEmailTemplate('tpl1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// CAMPAGNES
// ===========================================

describe('getEmailCampaigns', () => {
  it('zet de status in de queryreeks', async () => {
    antwoordMet([]);
    await getEmailCampaigns('scheduled');

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/email-campaigns?status=scheduled');
    expect(query.get('status')).toBe('scheduled');
  });

  it('bevraagt /email-campaigns zonder status', async () => {
    antwoordMet([]);
    await getEmailCampaigns();

    expect(laatsteVerzoek().pad).toBe('/email-campaigns');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft een lege lijst terug als er nog geen campagnes zijn', async () => {
    antwoordMet([]);
    await expect(getEmailCampaigns()).resolves.toEqual([]);
  });
});

describe('getEmailCampaign', () => {
  it('haalt een campagne op via het id', async () => {
    antwoordMet({ id: 'c1', name: 'Zomerbrief', recipientStats: { sent: 10 } });
    const campagne = await getEmailCampaign('c1');

    expect(laatsteVerzoek().pad).toBe('/email-campaigns/c1');
    expect(campagne.recipientStats).toEqual({ sent: 10 });
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Campagne niet gevonden.' });

    await expect(getEmailCampaign('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Campagne niet gevonden.' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getEmailCampaign('c1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getEmailCampaign('c1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('createEmailCampaign', () => {
  it('post de campagne met de doelgroepvelden erbij', async () => {
    antwoordMet({ id: 'c9', message: 'Campagne aangemaakt' });

    await createEmailCampaign({
      name: 'Zomerbrief',
      subject: 'Zomerprogramma',
      bodyHtml: '<p>Hoi {{firstName}}</p>',
      bodyText: 'Hoi {{firstName}}',
      templateId: 'tpl1',
      targetType: 'orchestras',
      targetOrchestras: ['o1', 'o2'],
      scheduledAt: '2026-06-01T09:00:00.000Z',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns');
    expect(verzoek.body).toEqual({
      name: 'Zomerbrief',
      subject: 'Zomerprogramma',
      bodyHtml: '<p>Hoi {{firstName}}</p>',
      bodyText: 'Hoi {{firstName}}',
      templateId: 'tpl1',
      targetType: 'orchestras',
      targetOrchestras: ['o1', 'o2'],
      scheduledAt: '2026-06-01T09:00:00.000Z',
    });
  });

  it('stuurt een lege doelgroeplijst mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'c9', message: '' });
    await createEmailCampaign({
      name: 'Leeg',
      subject: 'Leeg',
      bodyHtml: '<p></p>',
      targetType: 'custom',
      targetUserIds: [],
    });

    // Een lege lijst is een bewuste keuze ("nog niemand geselecteerd") en mag
    // niet als "geen doelgroep opgegeven" bij de server aankomen.
    expect(laatsteVerzoek().body).toMatchObject({ targetUserIds: [] });
  });

  it('geeft een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Onderwerp is verplicht.' });

    await expect(
      createEmailCampaign({ name: 'x', subject: '', bodyHtml: '', targetType: 'all' }),
    ).rejects.toMatchObject({ response: { status: 400, data: { error: 'Onderwerp is verplicht.' } } });
  });
});

describe('updateEmailCampaign', () => {
  it('gebruikt PUT op /email-campaigns/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateEmailCampaign('c1', { subject: 'Ander onderwerp' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/email-campaigns/c1');
    expect(verzoek.body).toEqual({ subject: 'Ander onderwerp' });
  });

  it('laat een 400 door als de campagne al verzonden is', async () => {
    antwoordMetFout(400, { error: 'Alleen conceptcampagnes kunnen worden bewerkt.' });

    await expect(updateEmailCampaign('c1', { subject: 'x' })).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('deleteEmailCampaign', () => {
  it('verwijdert een campagne', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteEmailCampaign('c1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/email-campaigns/c1');
  });
});

// ===========================================
// VERZENDEN
// ===========================================

describe('previewRecipients', () => {
  it('bevraagt de voorbeeldlijst van ontvangers', async () => {
    antwoordMet({ count: 2, recipients: [{ id: 'u1', email: 'jan@example.com', name: 'Jan' }] });
    const voorbeeld = await previewRecipients('c1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/email-campaigns/c1/preview-recipients');
    expect(voorbeeld.count).toBe(2);
  });

  it('geeft nul ontvangers terug zonder te vallen', async () => {
    antwoordMet({ count: 0, recipients: [] });

    await expect(previewRecipients('c1')).resolves.toEqual({ count: 0, recipients: [] });
  });
});

describe('scheduleCampaign', () => {
  it('stuurt het gekozen moment mee', async () => {
    antwoordMet({ message: 'Campagne ingepland.' });
    await scheduleCampaign('c1', '2026-06-01T09:00:00.000Z');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/c1/schedule');
    // De backend leest req.body.scheduledAt.
    expect(verzoek.body).toEqual({ scheduledAt: '2026-06-01T09:00:00.000Z' });
  });

  it('stuurt een lege body als er geen moment is opgegeven', async () => {
    antwoordMet({ message: '' });
    await scheduleCampaign('c1');

    // De backend valt dan terug op "nu"; een lege body is dus goed, maar hij
    // moet wel een geldig JSON-object blijven.
    expect(laatsteVerzoek().body).toEqual({});
  });

  it('laat een 400 door als de campagne geen concept meer is', async () => {
    antwoordMetFout(400, { error: 'Alleen conceptcampagnes kunnen worden ingepland.' });

    await expect(scheduleCampaign('c1')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('cancelCampaign en sendCampaign', () => {
  it('cancelCampaign post zonder body op de cancel-route', async () => {
    antwoordMet({ message: 'Geannuleerd' });
    await cancelCampaign('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/c1/cancel');
    expect(verzoek.body).toBeUndefined();
  });

  it('sendCampaign post zonder body op de send-route', async () => {
    antwoordMet({ message: 'Verzenden gestart' });
    await sendCampaign('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/c1/send');
    expect(verzoek.body).toBeUndefined();
  });
});

describe('sendTestEmail', () => {
  it('stuurt het testadres onder de sleutel email', async () => {
    antwoordMet({ message: 'Testmail verstuurd' });
    await sendTestEmail('c1', 'jan@example.com');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/c1/test');
    // De backend weigert met 400 als req.body.email leeg is.
    expect(verzoek.body).toEqual({ email: 'jan@example.com' });
  });

  it('laat de 400 doorkomen als de server het adres afwijst', async () => {
    antwoordMetFout(400, { error: 'E-mailadres is verplicht.' });

    await expect(sendTestEmail('c1', '')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'E-mailadres is verplicht.' } },
    });
  });
});

// ===========================================
// BIJLAGEN
// ===========================================

describe('bijlagen', () => {
  it('getCampaignAttachments bevraagt de bijlagenlijst', async () => {
    antwoordMet([{ id: 'at1', filename: 'programma.pdf' }]);
    const bijlagen = await getCampaignAttachments('c1');

    expect(laatsteVerzoek().pad).toBe('/email-campaigns/c1/attachments');
    expect(bijlagen).toHaveLength(1);
  });

  it('uploadCampaignAttachment stuurt het bestand als formulierdata onder de sleutel file', async () => {
    antwoordMet({ id: 'at9', message: 'Bijlage toegevoegd' });
    const bestand = new File(['inhoud'], 'programma.pdf', { type: 'application/pdf' });

    await uploadCampaignAttachment('c1', bestand);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/email-campaigns/c1/attachments');
    // multer leest het veld 'file'; onder een andere naam komt het bestand
    // nooit aan en krijgt de gebruiker een onduidelijke fout.
    expect(verzoek.body).toBeInstanceOf(FormData);
    const formulier = verzoek.body as FormData;
    expect(formulier.get('file')).toBeInstanceOf(File);
    expect((formulier.get('file') as File).name).toBe('programma.pdf');
  });

  it('uploadCampaignAttachment laat de 413 doorkomen bij een te groot bestand', async () => {
    antwoordMetFout(413, { error: 'Bestand is te groot.' });
    const bestand = new File(['x'], 'groot.pdf', { type: 'application/pdf' });

    await expect(uploadCampaignAttachment('c1', bestand)).rejects.toMatchObject({ response: { status: 413 } });
  });

  it('deleteCampaignAttachment verwijdert de juiste bijlage', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteCampaignAttachment('c1', 'at1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/email-campaigns/c1/attachments/at1');
  });
});

// ===========================================
// ONTVANGERS
// ===========================================

describe('getCampaignRecipients', () => {
  it('bevraagt de ontvangerslijst van een campagne', async () => {
    antwoordMet({ recipients: [], total: 0, byStatus: {} });
    await getCampaignRecipients('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/email-campaigns/c1/recipients');
    // LET OP: backend/src/routes/email-campaigns.ts kent wel
    // /:id/preview-recipients maar geen /:id/recipients. Dit verzoek komt dus
    // in de 404-afhandeling terecht. Deze test legt vast wat de frontend nu
    // verstuurt; de route moet aan serverkant nog gemaakt worden.
  });

  it('geeft de verdeling per status ongewijzigd door', async () => {
    const antwoord = {
      recipients: [{ id: 'r1', email: 'jan@example.com', name: 'Jan', status: 'opened' }],
      total: 1,
      byStatus: { pending: 0, sent: 1, delivered: 1, opened: 1, clicked: 0, bounced: 0, failed: 0 },
    };
    antwoordMet(antwoord);

    await expect(getCampaignRecipients('c1')).resolves.toEqual(antwoord);
  });

  it('laat een 404 doorkomen in plaats van een lege lijst te verzinnen', async () => {
    antwoordMetFout(404, { error: 'Niet gevonden' });

    await expect(getCampaignRecipients('c1')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de mailingcampagnes-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getEmailCampaigns();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteEmailCampaign('c1')).resolves.toBe('');
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getEmailTemplates()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
