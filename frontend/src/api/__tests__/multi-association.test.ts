/**
 * Tests voor de api rond meerdere verenigingen.
 *
 * Alle routes hier hangen onder /api/multi-association (zie index.ts van de
 * backend). De veldnamen zijn vergeleken met backend/src/routes/multi-association.ts.
 * Twee dingen vragen extra aandacht: de vaste paden onder /super-admin die niet
 * als :id gelezen mogen worden, en het onderscheid tussen functies die het
 * antwoord teruggeven en functies die bewust niets teruggeven.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  checkIsSuperAdmin,
  getSuperAdminAssociations,
  createAssociationAsSuperAdmin,
  updateAssociationAsSuperAdmin,
  updateAssociationSubscription,
  deleteAssociationAsSuperAdmin,
  getSuperAdmins,
  addSuperAdmin,
  removeSuperAdmin,
  getMyAssociations,
  switchAssociation,
  getInvitations,
  createInvitation,
  deleteInvitation,
  getInvitationDetails,
  acceptInvitation,
  getPartnerships,
  getPartnerMusic,
  getPartnerEvents,
  requestPartnership,
  approvePartnership,
  rejectPartnership,
  endPartnership,
  shareEvent,
  unshareEvent,
  getActivityLog,
  getAssociationMembers,
  updateMemberRole,
  removeMember,
} from '../multi-association';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// SUPER ADMIN
// ===========================================

describe('checkIsSuperAdmin', () => {
  it('bevraagt /multi-association/am-i-super-admin', async () => {
    antwoordMet({ isSuperAdmin: true });
    const resultaat = await checkIsSuperAdmin();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/multi-association/am-i-super-admin');
    expect(resultaat.isSuperAdmin).toBe(true);
  });

  it('geeft false gewoon door en maakt er niets anders van', async () => {
    antwoordMet({ isSuperAdmin: false });

    await expect(checkIsSuperAdmin()).resolves.toEqual({ isSuperAdmin: false });
  });

  it('laat een 403 door voor wie geen super admin is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(checkIsSuperAdmin()).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('verenigingen als super admin', () => {
  it('haalt de lijst met verenigingen op', async () => {
    antwoordMet([{ id: 'v1', name: 'Harmonie', isActive: true, createdAt: '2026-01-01' }]);
    const verenigingen = await getSuperAdminAssociations();

    expect(laatsteVerzoek().pad).toBe('/multi-association/super-admin/associations');
    expect(verenigingen).toHaveLength(1);
  });

  it('geeft een lege lijst door als er nog geen verenigingen zijn', async () => {
    antwoordMet([]);

    await expect(getSuperAdminAssociations()).resolves.toEqual([]);
  });

  it('maakt een vereniging aan en geeft id en slug terug', async () => {
    antwoordMet({ id: 'v1', slug: 'harmonie', message: 'Vereniging aangemaakt.' }, { status: 201 });

    const resultaat = await createAssociationAsSuperAdmin({
      name: 'Harmonie Sint Cecilia',
      displayName: 'Cecilia',
      city: 'Boxtel',
      postalCode: '5281 AA',
      billingEmail: 'penningmeester@example.com',
      kvkNumber: '12345678',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/super-admin/associations');
    // createAssociationSchema leest deze namen letterlijk uit de body.
    expect(verzoek.body).toMatchObject({
      name: 'Harmonie Sint Cecilia',
      displayName: 'Cecilia',
      postalCode: '5281 AA',
      billingEmail: 'penningmeester@example.com',
      kvkNumber: '12345678',
    });
    expect(resultaat).toMatchObject({ id: 'v1', slug: 'harmonie' });
  });

  it('laat een 409 door als de naam al bestaat', async () => {
    antwoordMetFout(409, { error: 'Vereniging met deze naam bestaat al.' });

    await expect(createAssociationAsSuperAdmin({ name: 'Harmonie' })).rejects.toMatchObject({
      response: { status: 409, data: { error: 'Vereniging met deze naam bestaat al.' } },
    });
  });

  it('werkt een vereniging bij met PUT en geeft niets terug', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    const resultaat = await updateAssociationAsSuperAdmin('v1', { city: 'Den Bosch' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/multi-association/super-admin/associations/v1');
    expect(laatsteVerzoek().body).toEqual({ city: 'Den Bosch' });
    expect(resultaat).toBeUndefined();
  });

  it('werkt het abonnement bij op de eigen subroute', async () => {
    antwoordMet({ message: 'Abonnement bijgewerkt.' });

    await updateAssociationSubscription('v1', {
      subscriptionTier: 'pro',
      subscriptionExpires: '2027-01-01',
      maxMembers: 200,
      maxOrchestras: 4,
      maxStorageMb: 10240,
      isActive: true,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/multi-association/super-admin/associations/v1/subscription');
    // De backend destructureert precies deze zes namen uit req.body.
    expect(verzoek.body).toEqual({
      subscriptionTier: 'pro',
      subscriptionExpires: '2027-01-01',
      maxMembers: 200,
      maxOrchestras: 4,
      maxStorageMb: 10240,
      isActive: true,
    });
  });

  it('stuurt isActive false mee in plaats van het veld weg te laten', async () => {
    antwoordMet({ message: 'Abonnement bijgewerkt.' });
    await updateAssociationSubscription('v1', { isActive: false });

    // false is niet hetzelfde als "niet opgegeven": de backend zet is_active
    // dan op 0 in plaats van de oude waarde te laten staan.
    expect(laatsteVerzoek().body).toEqual({ isActive: false });
  });

  it('verwijdert een vereniging', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteAssociationAsSuperAdmin('v1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/super-admin/associations/v1');
  });
});

describe('super admins', () => {
  it('haalt de super admins op', async () => {
    antwoordMet([]);
    await getSuperAdmins();

    expect(laatsteVerzoek().pad).toBe('/multi-association/super-admin/super-admins');
  });

  it('voegt een super admin toe met userId en rechten', async () => {
    antwoordMet({ id: 'sa1' }, { status: 201 });

    await addSuperAdmin('u1', ['associations', 'billing']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/super-admin/super-admins');
    expect(verzoek.body).toEqual({ userId: 'u1', permissions: ['associations', 'billing'] });
  });

  it('laat permissions weg als er geen rechten zijn opgegeven, zodat de backend zijn eigen standaard kiest', async () => {
    antwoordMet({ id: 'sa1' }, { status: 201 });
    await addSuperAdmin('u1');

    // De backend maakt er dan ['all'] van; een lege lijst zou iets anders zijn.
    expect(laatsteVerzoek().body).toEqual({ userId: 'u1' });
  });

  it('verwijdert een super admin', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await removeSuperAdmin('sa1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/super-admin/super-admins/sa1');
  });
});

// ===========================================
// EIGEN VERENIGINGEN
// ===========================================

describe('getMyAssociations', () => {
  it('bevraagt /multi-association/my-associations', async () => {
    antwoordMet([{ id: 'v1', name: 'Harmonie', myRole: 'admin', isPrimary: true }]);
    const verenigingen = await getMyAssociations();

    expect(laatsteVerzoek().pad).toBe('/multi-association/my-associations');
    expect(verenigingen[0].myRole).toBe('admin');
  });

  it('laat een 401 door en levert geen lege lijst op', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(getMyAssociations()).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('switchAssociation', () => {
  it('stuurt de vereniging mee en geeft het nieuwe token terug', async () => {
    antwoordMet({
      message: 'Gewisseld.',
      associationId: 'v2',
      associationName: 'Fanfare',
      token: 'nieuw-token',
    });

    const resultaat = await switchAssociation('v2');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/switch-association');
    expect(verzoek.body).toEqual({ associationId: 'v2' });
    // Het token uit het antwoord moet doorkomen; zonder token blijft de
    // gebruiker in de oude vereniging hangen.
    expect(resultaat.token).toBe('nieuw-token');
  });

  it('laat een 404 door als de vereniging niet bestaat', async () => {
    antwoordMetFout(404, { error: 'Vereniging niet gevonden.' });

    await expect(switchAssociation('weg')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// UITNODIGINGEN
// ===========================================

describe('uitnodigingen', () => {
  it('haalt de openstaande uitnodigingen op', async () => {
    antwoordMet([]);
    await getInvitations();

    expect(laatsteVerzoek().pad).toBe('/multi-association/invitations');
  });

  it('nodigt iemand uit met e-mailadres en rol', async () => {
    antwoordMet({ id: 'i1', inviteUrl: '/invite/abc', message: 'Uitnodiging verstuurd.' }, { status: 201 });

    const resultaat = await createInvitation('nieuw@example.com', 'board');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/invitations');
    expect(verzoek.body).toEqual({ email: 'nieuw@example.com', role: 'board' });
    expect(resultaat.inviteUrl).toBe('/invite/abc');
  });

  it('gebruikt member als er geen rol wordt meegegeven', async () => {
    antwoordMet({ id: 'i1', inviteUrl: '/invite/abc' }, { status: 201 });
    await createInvitation('nieuw@example.com');

    expect(laatsteVerzoek().body).toEqual({ email: 'nieuw@example.com', role: 'member' });
  });

  it('laat een 409 door als er al een uitnodiging openstaat', async () => {
    antwoordMetFout(409, { error: 'Er staat al een uitnodiging open voor dit e-mailadres.' });

    await expect(createInvitation('nieuw@example.com')).rejects.toMatchObject({
      response: { status: 409 },
    });
  });

  it('trekt een uitnodiging in', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteInvitation('i1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/invitations/i1');
  });

  it('haalt de gegevens bij een uitnodigingstoken op', async () => {
    antwoordMet({
      email: 'nieuw@example.com',
      associationName: 'Harmonie',
      role: 'member',
      expiresAt: '2026-09-01T00:00:00Z',
    });

    const gegevens = await getInvitationDetails('abc123');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/multi-association/invitations/accept/abc123');
    expect(gegevens.associationName).toBe('Harmonie');
  });

  it('accepteert een uitnodiging met POST op hetzelfde pad', async () => {
    antwoordMet({ message: 'Welkom.' });

    const resultaat = await acceptInvitation('abc123');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/multi-association/invitations/accept/abc123');
    expect(resultaat).toBeUndefined();
  });

  it('laat een verlopen uitnodiging als 400 doorkomen', async () => {
    antwoordMetFout(400, { error: 'Uitnodiging is verlopen.' });

    await expect(getInvitationDetails('oud')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Uitnodiging is verlopen.' } },
    });
  });
});

// ===========================================
// PARTNERSCHAPPEN
// ===========================================

describe('partnerschappen', () => {
  it('haalt de partnerschappen op', async () => {
    antwoordMet([]);
    await getPartnerships();

    expect(laatsteVerzoek().pad).toBe('/multi-association/partnerships');
  });

  it('haalt de gedeelde muziek van partners op', async () => {
    antwoordMet([{ id: 'm1', title: 'Ammerland', associationName: 'Fanfare' }]);
    const titels = await getPartnerMusic();

    expect(laatsteVerzoek().pad).toBe('/multi-association/partners/music');
    expect(titels[0].associationName).toBe('Fanfare');
  });

  it('haalt de gedeelde concerten van partners op', async () => {
    antwoordMet([]);
    await getPartnerEvents();

    expect(laatsteVerzoek().pad).toBe('/multi-association/partners/events');
  });

  it('vraagt een partnerschap aan met de deelvinkjes', async () => {
    antwoordMet({ id: 'pt1' }, { status: 201 });

    await requestPartnership({
      targetAssociationId: 'v2',
      shareMusic: true,
      shareEvents: false,
      shareMembers: false,
      notes: 'Samen op concours',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/partnerships');
    expect(verzoek.body).toEqual({
      targetAssociationId: 'v2',
      shareMusic: true,
      shareEvents: false,
      shareMembers: false,
      notes: 'Samen op concours',
    });
  });

  it('stuurt alleen de doelvereniging als er verder niets gekozen is', async () => {
    antwoordMet({ id: 'pt1' }, { status: 201 });
    await requestPartnership({ targetAssociationId: 'v2' });

    expect(laatsteVerzoek().body).toEqual({ targetAssociationId: 'v2' });
  });

  it('keurt een partnerschap goed met PUT en zonder body', async () => {
    antwoordMet({ message: 'Goedgekeurd.' });
    await approvePartnership('pt1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/multi-association/partnerships/pt1/approve');
    expect(verzoek.body).toBeUndefined();
  });

  it('wijst een partnerschap af', async () => {
    antwoordMet({ message: 'Afgewezen.' });
    await rejectPartnership('pt1');

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/multi-association/partnerships/pt1/reject');
  });

  it('beeindigt een partnerschap', async () => {
    antwoordMet({ message: 'Beeindigd.' });
    await endPartnership('pt1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/partnerships/pt1');
  });

  it('laat een 403 door als de aanvrager geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(requestPartnership({ targetAssociationId: 'v2' })).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});

// ===========================================
// EVENEMENT DELEN
// ===========================================

describe('shareEvent', () => {
  it('vouwt de opties samen met de doelvereniging in een platte body', async () => {
    antwoordMet({ message: 'Evenement gedeeld.' });

    await shareEvent('e1', 'v2', { canEdit: true, canAddMembers: false });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/multi-association/events/e1/share');
    // De backend leest targetAssociationId, canEdit en canAddMembers op het
    // hoogste niveau van de body, niet in een genest opties-object.
    expect(verzoek.body).toEqual({ targetAssociationId: 'v2', canEdit: true, canAddMembers: false });
  });

  it('stuurt alleen de doelvereniging als er geen opties zijn', async () => {
    antwoordMet({ message: 'Evenement gedeeld.' });
    await shareEvent('e1', 'v2');

    expect(laatsteVerzoek().body).toEqual({ targetAssociationId: 'v2' });
  });

  it('haalt een deling weer weg met beide ids in het pad', async () => {
    antwoordMet({ message: 'Deling ingetrokken.' });
    await unshareEvent('e1', 'v2');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/events/e1/share/v2');
  });

  it('laat een 403 door als er geen actief partnerschap is', async () => {
    antwoordMetFout(403, { error: 'Geen actief partnerschap met evenement delen gevonden.' });

    await expect(shareEvent('e1', 'v2')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// LOGBOEK EN LEDEN
// ===========================================

describe('getActivityLog', () => {
  it('geeft limiet en beginpunt als queryparameters mee', async () => {
    antwoordMet([]);
    await getActivityLog({ limit: 25, offset: 50 });

    expect(laatsteVerzoek().pad).toBe('/multi-association/activity-log');
    expect(laatsteVerzoek().query.get('limit')).toBe('25');
    expect(laatsteVerzoek().query.get('offset')).toBe('50');
  });

  it('stuurt geen queryreeks mee als er niets is opgegeven', async () => {
    antwoordMet([]);
    await getActivityLog();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('stuurt offset 0 wel mee', async () => {
    antwoordMet([]);
    await getActivityLog({ offset: 0 });

    expect(laatsteVerzoek().query.get('offset')).toBe('0');
  });

  it('geeft regels met een lege gebruiker ongewijzigd door', async () => {
    const antwoord = [
      {
        id: 'l1',
        userId: null,
        userName: null,
        action: 'association_created',
        entityType: 'association',
        entityId: 'v1',
        details: { name: 'Harmonie' },
        createdAt: '2026-01-01T10:00:00Z',
      },
    ];
    antwoordMet(antwoord);

    await expect(getActivityLog()).resolves.toEqual(antwoord);
  });
});

describe('leden', () => {
  it('haalt de leden van de vereniging op', async () => {
    antwoordMet([{ userId: 'u1', email: 'a@b.nl', name: 'Jan', role: 'member' }]);
    const leden = await getAssociationMembers();

    expect(laatsteVerzoek().pad).toBe('/multi-association/members');
    expect(leden[0].userId).toBe('u1');
  });

  it('wijzigt de rol van een lid', async () => {
    antwoordMet({ message: 'Rol bijgewerkt.' });

    await updateMemberRole('u1', 'admin');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/multi-association/members/u1/role');
    expect(verzoek.body).toEqual({ role: 'admin' });
  });

  it('laat een 400 door bij een ongeldige rol', async () => {
    antwoordMetFout(400, { error: 'Ongeldige rol.' });

    await expect(updateMemberRole('u1', 'member')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Ongeldige rol.' } },
    });
  });

  it('verwijdert een lid uit de vereniging', async () => {
    antwoordMet({ message: 'Lid verwijderd.' });
    await removeMember('u1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/multi-association/members/u1');
  });

  it('laat een netwerkfout door in plaats van een lege ledenlijst', async () => {
    antwoordMetNetwerkfout();

    await expect(getAssociationMembers()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });
});

describe('algemeen gedrag', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getMyAssociations();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een object door waar een lijst werd verwacht zonder het te wissen', async () => {
    antwoordMet({ error: 'geen lijst' });

    await expect(getMyAssociations()).resolves.toEqual({ error: 'geen lijst' });
  });
});
