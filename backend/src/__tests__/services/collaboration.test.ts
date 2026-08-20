/**
 * Samenwerking tussen verenigingen: gedeelde bibliotheken, wie er bij mag,
 * verzoeken over en weer, en het overnemen van een titel.
 *
 * Dit is de enige plek waar gegevens bewust de grens van één vereniging
 * oversteken. Daarom gaan de meeste tests over de vraag wie wat mag zien:
 * een openbare bibliotheek, een verleend recht, of niets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, TestAssociation, TestUser } from '../testUtils';
import {
  createSharedLibrary,
  getSharedLibrary,
  getOwnedSharedLibraries,
  getAccessibleLibraries,
  getPublicLibraries,
  updateSharedLibrary,
  deleteSharedLibrary,
  addTitleToLibrary,
  removeTitleFromLibrary,
  getLibraryTitles,
  grantLibraryAccess,
  revokeLibraryAccess,
  getLibraryAccessList,
  checkLibraryAccess,
  createCollaborationRequest,
  getCollaborationRequest,
  getIncomingRequests,
  getOutgoingRequests,
  respondToRequest,
  importTitle,
} from '../../services/collaboration';

describe('samenwerking tussen verenigingen', () => {
  let eigen: TestAssociation;
  let eigenLid: TestUser;
  let andere: TestAssociation;

  function maakTitel(associationId: string, titel = 'Mars'): string {
    const id = uuidv4();
    testDb
      .prepare(
        "INSERT INTO music_titles (id, title, composer, arranger, association_id) VALUES (?, ?, 'Sousa', 'Reed', ?)",
      )
      .run(id, titel, associationId);
    return id;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    eigen = omgeving.association;
    eigenLid = omgeving.adminUser;
    andere = createTestAssociation();
  });

  describe('bibliotheek aanmaken en aanpassen', () => {
    it('maakt een bibliotheek en geeft hem terug', () => {
      const bib = createSharedLibrary(eigen.id, 'Marsen', 'Onze marsen', false);
      expect(bib).toMatchObject({ name: 'Marsen', description: 'Onze marsen', ownerAssociationId: eigen.id });
      expect(bib.isPublic).toBe(false);
    });

    it('noemt de naam van de eigenaar erbij', () => {
      const bib = createSharedLibrary(eigen.id, 'Marsen', null, false);
      expect(getSharedLibrary(bib.id)?.ownerAssociationName).toBe(eigen.name);
    });

    it('geeft null voor een bibliotheek die niet bestaat', () => {
      expect(getSharedLibrary(uuidv4())).toBeNull();
    });

    it('werkt naam, omschrijving en zichtbaarheid bij', () => {
      const bib = createSharedLibrary(eigen.id, 'Oud', null, false);
      updateSharedLibrary(bib.id, 'Nieuw', 'Met omschrijving', true);

      expect(getSharedLibrary(bib.id)).toMatchObject({
        name: 'Nieuw',
        description: 'Met omschrijving',
        isPublic: true,
      });
    });

    it('verwijdert een bibliotheek', () => {
      const bib = createSharedLibrary(eigen.id, 'Weg', null, false);
      deleteSharedLibrary(bib.id);
      expect(getSharedLibrary(bib.id)).toBeNull();
    });
  });

  describe('welke bibliotheken zie ik', () => {
    it('toont de eigen bibliotheken', () => {
      createSharedLibrary(eigen.id, 'Van ons', null, false);
      createSharedLibrary(andere.id, 'Van hen', null, false);

      const eigenLijst = getOwnedSharedLibraries(eigen.id);
      expect(eigenLijst).toHaveLength(1);
      expect(eigenLijst[0].name).toBe('Van ons');
    });

    it('toont openbare bibliotheken van anderen, maar niet de eigen', () => {
      createSharedLibrary(eigen.id, 'Onze openbare', null, true);
      createSharedLibrary(andere.id, 'Hun openbare', null, true);
      createSharedLibrary(andere.id, 'Hun besloten', null, false);

      const openbaar = getPublicLibraries(eigen.id);
      expect(openbaar.map((b) => b.name)).toEqual(['Hun openbare']);
    });

    it('toont een besloten bibliotheek pas na een verleend recht', () => {
      const bib = createSharedLibrary(andere.id, 'Besloten', null, false);
      expect(getAccessibleLibraries(eigen.id)).toEqual([]);

      grantLibraryAccess(bib.id, eigen.id, 'view', eigenLid.id);
      const toegankelijk = getAccessibleLibraries(eigen.id);
      expect(toegankelijk).toHaveLength(1);
      expect(toegankelijk[0]).toMatchObject({ name: 'Besloten', accessLevel: 'view' });
    });
  });

  describe('titels in een bibliotheek', () => {
    it('voegt een titel toe en haalt hem weer op', () => {
      const bib = createSharedLibrary(eigen.id, 'Marsen', null, false);
      const titelId = maakTitel(eigen.id, 'Washington Post');
      addTitleToLibrary(bib.id, titelId, eigenLid.id);

      const titels = getLibraryTitles(bib.id);
      expect(titels).toHaveLength(1);
      expect(titels[0]).toMatchObject({ title: 'Washington Post', composer: 'Sousa' });
    });

    it('haalt een titel er weer uit', () => {
      const bib = createSharedLibrary(eigen.id, 'Marsen', null, false);
      const titelId = maakTitel(eigen.id);
      addTitleToLibrary(bib.id, titelId, eigenLid.id);
      removeTitleFromLibrary(bib.id, titelId);

      expect(getLibraryTitles(bib.id)).toEqual([]);
    });

    it('geeft een lege lijst voor een lege bibliotheek', () => {
      const bib = createSharedLibrary(eigen.id, 'Leeg', null, false);
      expect(getLibraryTitles(bib.id)).toEqual([]);
    });
  });

  describe('toegang verlenen en intrekken', () => {
    it('herkent de eigenaar zonder verleend recht', () => {
      const bib = createSharedLibrary(eigen.id, 'Van ons', null, false);
      expect(checkLibraryAccess(bib.id, eigen.id)).toEqual({
        hasAccess: true,
        accessLevel: 'owner',
        isOwner: true,
      });
    });

    it('houdt een vreemde vereniging buiten', () => {
      const bib = createSharedLibrary(eigen.id, 'Van ons', null, false);
      expect(checkLibraryAccess(bib.id, andere.id)).toEqual({
        hasAccess: false,
        accessLevel: null,
        isOwner: false,
      });
    });

    it('laat binnen zodra er een recht is verleend', () => {
      const bib = createSharedLibrary(eigen.id, 'Van ons', null, false);
      grantLibraryAccess(bib.id, andere.id, 'download', eigenLid.id);

      expect(checkLibraryAccess(bib.id, andere.id)).toEqual({
        hasAccess: true,
        accessLevel: 'download',
        isOwner: false,
      });
    });

    it('vervangt een bestaand recht in plaats van er een tweede naast te zetten', () => {
      const bib = createSharedLibrary(eigen.id, 'Van ons', null, false);
      grantLibraryAccess(bib.id, andere.id, 'view', eigenLid.id);
      grantLibraryAccess(bib.id, andere.id, 'contribute', eigenLid.id);

      expect(getLibraryAccessList(bib.id)).toHaveLength(1);
      expect(checkLibraryAccess(bib.id, andere.id).accessLevel).toBe('contribute');
    });

    it('sluit de deur weer bij intrekken', () => {
      const bib = createSharedLibrary(eigen.id, 'Van ons', null, false);
      grantLibraryAccess(bib.id, andere.id, 'view', eigenLid.id);
      revokeLibraryAccess(bib.id, andere.id);

      expect(checkLibraryAccess(bib.id, andere.id).hasAccess).toBe(false);
      expect(getLibraryAccessList(bib.id)).toEqual([]);
    });

    it('meldt geen toegang voor een bibliotheek die niet bestaat', () => {
      expect(checkLibraryAccess(uuidv4(), eigen.id).hasAccess).toBe(false);
    });
  });

  describe('verzoeken over en weer', () => {
    it('legt een verzoek vast met status open', () => {
      const verzoek = createCollaborationRequest(eigen.id, andere.id, null, 'Mogen we meekijken?');
      expect(verzoek).toMatchObject({
        fromAssociationId: eigen.id,
        toAssociationId: andere.id,
        status: 'pending',
        message: 'Mogen we meekijken?',
      });
    });

    it('geeft null voor een verzoek dat niet bestaat', () => {
      expect(getCollaborationRequest(uuidv4())).toBeNull();
    });

    it('toont een verzoek bij de ontvanger als binnenkomend', () => {
      createCollaborationRequest(eigen.id, andere.id, null, null);
      expect(getIncomingRequests(andere.id)).toHaveLength(1);
      expect(getIncomingRequests(eigen.id)).toEqual([]);
    });

    it('toont hetzelfde verzoek bij de afzender als uitgaand', () => {
      createCollaborationRequest(eigen.id, andere.id, null, null);
      expect(getOutgoingRequests(eigen.id)).toHaveLength(1);
      expect(getOutgoingRequests(andere.id)).toEqual([]);
    });

    it('zet een afgewezen verzoek op afgewezen zonder toegang te geven', () => {
      const bib = createSharedLibrary(andere.id, 'Besloten', null, false);
      const verzoek = createCollaborationRequest(eigen.id, andere.id, bib.id, null);

      respondToRequest(verzoek.id, 'rejected', 'Liever niet', eigenLid.id);

      expect(getCollaborationRequest(verzoek.id)?.status).toBe('rejected');
      expect(checkLibraryAccess(bib.id, eigen.id).hasAccess).toBe(false);
    });

    it('geeft bij goedkeuren meteen toegang tot de bibliotheek', () => {
      const bib = createSharedLibrary(andere.id, 'Besloten', null, false);
      const verzoek = createCollaborationRequest(eigen.id, andere.id, bib.id, null);

      respondToRequest(verzoek.id, 'accepted', 'Ga je gang', eigenLid.id, 'download');

      expect(getCollaborationRequest(verzoek.id)?.status).toBe('accepted');
      expect(checkLibraryAccess(bib.id, eigen.id).accessLevel).toBe('download');
    });

    it('geeft standaard alleen leesrecht', () => {
      const bib = createSharedLibrary(andere.id, 'Besloten', null, false);
      const verzoek = createCollaborationRequest(eigen.id, andere.id, bib.id, null);

      respondToRequest(verzoek.id, 'accepted', null, eigenLid.id);

      expect(checkLibraryAccess(bib.id, eigen.id).accessLevel).toBe('view');
    });

    it('weigert een antwoord op een verzoek dat niet bestaat', () => {
      expect(() => respondToRequest(uuidv4(), 'accepted', null, eigenLid.id)).toThrow(/Request not found/);
    });
  });

  describe('importTitle', () => {
    it('maakt een eigen kopie van de titel', () => {
      const bib = createSharedLibrary(andere.id, 'Hun bibliotheek', null, true);
      const bronTitel = maakTitel(andere.id, 'Washington Post');
      addTitleToLibrary(bib.id, bronTitel, eigenLid.id);

      const { newTitleId } = importTitle(bronTitel, bib.id, eigen.id, eigenLid.id);

      expect(newTitleId).not.toBe(bronTitel);
      const kopie = testDb
        .prepare('SELECT title, composer, association_id, is_shared FROM music_titles WHERE id = ?')
        .get(newTitleId) as { title: string; composer: string; association_id: string; is_shared: number };
      expect(kopie).toMatchObject({
        title: 'Washington Post',
        composer: 'Sousa',
        association_id: eigen.id,
        is_shared: 0,
      });
    });

    it('laat de titel van de ander ongemoeid', () => {
      const bib = createSharedLibrary(andere.id, 'Hun bibliotheek', null, true);
      const bronTitel = maakTitel(andere.id, 'Washington Post');
      addTitleToLibrary(bib.id, bronTitel, eigenLid.id);

      importTitle(bronTitel, bib.id, eigen.id, eigenLid.id);

      const bron = testDb.prepare('SELECT association_id FROM music_titles WHERE id = ?').get(bronTitel) as {
        association_id: string;
      };
      expect(bron.association_id).toBe(andere.id);
    });

    it('weigert een titel die niet in de bibliotheek zit', () => {
      const bib = createSharedLibrary(andere.id, 'Hun bibliotheek', null, true);
      const losseTitel = maakTitel(andere.id);

      expect(() => importTitle(losseTitel, bib.id, eigen.id, eigenLid.id)).toThrow(/not found in library/);
    });
  });
});
