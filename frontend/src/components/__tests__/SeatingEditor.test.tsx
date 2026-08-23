/**
 * De stoelindeling van het orkest.
 *
 * SeatingEditor laat leden met de muis naar een sectie slepen. Slepen wordt
 * hier niet nagebootst: dat hangt aan een dataTransfer en aan posities die
 * jsdom niet levert, en een test die dat met verzonnen afmetingen naspeelt zegt
 * meer over de test dan over het scherm. Het toetsenbord doet in dit component
 * precies hetzelfde werk - de pijltjestoetsen zijn de toegankelijke tegenhanger
 * van het slepen - en daarmee is elke verplaatsing wel te maken. De rest is de
 * toestand eromheen: wie waar staat, wie nog geen plek heeft, wat er bij
 * automatisch indelen gebeurt en wat er bij opslaan de deur uit gaat.
 *
 * Aanleiding: aan de serverkant bleek dat twee leden op dezelfde stoel konden
 * staan. De server weigert dat nu. Zie 'twee leden op dezelfde stoel'.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatingEditor from '../SeatingEditor';
import type { SeatingAssignment, SeatingSection, User } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const secties: SeatingSection[] = [
  {
    id: 's1',
    name: 'Klarinetten',
    rowNumber: 1,
    sortOrder: 1,
    instruments: [{ id: 'i1', name: 'Clarinet', tuning: 'Bb', sortOrder: 1 }],
    createdAt: '2026-01-01',
  },
  {
    id: 's2',
    name: 'Trompetten',
    rowNumber: 2,
    sortOrder: 1,
    instruments: [{ id: 'i2', name: 'Trumpet', tuning: 'Bb', sortOrder: 1 }],
    createdAt: '2026-01-01',
  },
];

function maakLid(id: string, voornaam: string, achternaam: string, instrument: string | null, orkest = 'o1'): User {
  return {
    id,
    email: `${id}@voorbeeld.nl`,
    firstName: voornaam,
    lastName: achternaam,
    role: 'member',
    associationId: 'v1',
    instruments: instrument ? [{ id: `inst-${id}`, name: instrument, tuning: null }] : [],
    orchestras: [{ id: orkest, name: 'Harmonie' }],
  };
}

const leden: User[] = [
  maakLid('u1', 'Anna', 'Bakker', 'Clarinet'),
  maakLid('u2', 'Bram', 'de Vries', 'Trumpet'),
  maakLid('u3', 'Carla', 'Jansen', null),
  maakLid('u4', 'Daan', 'Peters', 'Trumpet', 'o2'),
];

function maakToewijzing(userId: string, sectionId: string, positie: number): SeatingAssignment {
  return {
    id: `t-${userId}`,
    userId,
    userName: userId,
    userEmail: `${userId}@voorbeeld.nl`,
    sectionId,
    sectionName: sectionId,
    rowNumber: 1,
    positionInSection: positie,
    seatLabel: null,
    notes: null,
    instruments: null,
  };
}

function toon(opties: {
  toewijzingen?: SeatingAssignment[];
  secties?: SeatingSection[];
  // Een spion en niet zomaar een functie: de tests lezen `.mock.calls` uit om
  // te zien wat er de deur uit ging. De enige aanroeper die zelf iets
  // meegeeft, gebruikt ook vi.fn().
  opslaan?: Mock;
}) {
  const opslaan: Mock = opties.opslaan ?? vi.fn().mockResolvedValue(undefined);
  render(
    <SeatingEditor
      sections={opties.secties ?? secties}
      assignments={opties.toewijzingen ?? []}
      users={leden}
      orchestraId="o1"
      onSave={opslaan as never}
    />,
  );
  return { opslaan };
}

/** Het blokje van een lid op het scherm. */
function lid(userId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-user-id="${userId}"]`);
  if (!element) throw new Error(`Lid ${userId} staat niet op het scherm`);
  return element;
}

/** Waar het blokje van dit lid volgens zijn eigen label staat. */
function plekVan(userId: string): string {
  return lid(userId).getAttribute('aria-label') ?? '';
}

/**
 * Zet de aandacht op een lid en drukt een toets in.
 *
 * Na een verplaatsing zet het component de aandacht in een volgend beeldframe
 * terug op het verplaatste lid. Dat frame wordt hier afgewacht: anders loopt
 * het de volgende test in en pakt het daar de aandacht af van het lid dat die
 * test net had aangewezen.
 */
async function toets(gebruiker: ReturnType<typeof userEvent.setup>, userId: string, toetsen: string) {
  lid(userId).focus();
  await gebruiker.keyboard(toetsen);
  await new Promise((klaar) => requestAnimationFrame(() => klaar(null)));
}

/** De volgorde van de leden binnen het vlak waar dit lid in staat. */
function volgordeRond(userId: string): string[] {
  const vlak = lid(userId).parentElement!;
  return Array.from(vlak.querySelectorAll<HTMLElement>('[data-user-id]')).map((e) => e.dataset.userId!);
}

describe('SeatingEditor - wat er in beeld staat', () => {
  it('toont de secties op rijvolgorde met de dirigent bovenaan', () => {
    toon({});

    expect(screen.getByText('seating.conductor')).toBeInTheDocument();
    expect(screen.getByText('Klarinetten')).toBeInTheDocument();
    expect(screen.getByText('Trompetten')).toBeInTheDocument();
    // Beide secties zijn nog leeg en vragen om leden.
    expect(screen.getAllByText('seating.dropHere')).toHaveLength(2);
  });

  it('zet leden zonder plek onder de niet-ingedeelde leden, met hun aantal', () => {
    toon({});

    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(plekVan('u1')).toContain('seating.unassignedMembers');
    expect(plekVan('u3')).toContain('seating.unassignedMembers');
  });

  it('laat leden van een ander orkest buiten beeld', () => {
    toon({});

    expect(document.querySelector('[data-user-id="u4"]')).toBeNull();
    expect(screen.queryByText('Daan Peters')).not.toBeInTheDocument();
  });

  it('zet leden op de plek die de toewijzing noemt', () => {
    toon({ toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's2', 0)] });

    expect(plekVan('u1')).toContain('Klarinetten');
    expect(plekVan('u2')).toContain('Trompetten');
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('meldt het als iedereen een plek heeft', () => {
    toon({
      toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's2', 0), maakToewijzing('u3', 's1', 1)],
    });

    expect(screen.getByText('seating.allMembersAssigned')).toBeInTheDocument();
  });

  it('toont een lid zonder instrument zonder toelichting bij het blokje', () => {
    toon({});

    expect(lid('u3')).not.toHaveAttribute('title');
    expect(lid('u1')).toHaveAttribute('title', 'Clarinet');
    expect(screen.getByText('Carla Jansen')).toBeInTheDocument();
  });
});

describe('SeatingEditor - automatisch indelen', () => {
  it('zet leden bij de sectie die hun instrument speelt', async () => {
    const gebruiker = userEvent.setup();
    toon({});

    await gebruiker.click(screen.getByText('seating.autoAssign'));

    expect(plekVan('u1')).toContain('Klarinetten');
    expect(plekVan('u2')).toContain('Trompetten');
    expect(screen.getByText('seating.unsavedChanges')).toBeInTheDocument();
  });

  it('laat een lid zonder instrument ongeplaatst', async () => {
    const gebruiker = userEvent.setup();
    toon({});

    await gebruiker.click(screen.getByText('seating.autoAssign'));

    expect(plekVan('u3')).toContain('seating.unassignedMembers');
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('doet niets als er nog geen secties zijn', async () => {
    const gebruiker = userEvent.setup();
    toon({ secties: [] });

    await gebruiker.click(screen.getByText('seating.autoAssign'));

    expect(plekVan('u1')).toContain('seating.unassignedMembers');
    expect(plekVan('u2')).toContain('seating.unassignedMembers');
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });
});

describe('SeatingEditor - verplaatsen met het toetsenbord', () => {
  it('zet een lid zonder plek met pijl omhoog in de laatste sectie', async () => {
    const gebruiker = userEvent.setup();
    toon({});

    await toets(gebruiker, 'u1', '{ArrowUp}');

    expect(plekVan('u1')).toContain('Trompetten');
  });

  it('haalt een lid met pijl omlaag uit de laatste sectie weer weg', async () => {
    const gebruiker = userEvent.setup();
    toon({ toewijzingen: [maakToewijzing('u1', 's2', 0)] });

    await toets(gebruiker, 'u1', '{ArrowDown}');

    expect(plekVan('u1')).toContain('seating.unassignedMembers');
  });

  it('verplaatst een lid met pijl omhoog naar de sectie erboven', async () => {
    const gebruiker = userEvent.setup();
    toon({ toewijzingen: [maakToewijzing('u1', 's2', 0)] });

    await toets(gebruiker, 'u1', '{ArrowUp}');

    expect(plekVan('u1')).toContain('Klarinetten');
  });

  it('wisselt met pijl links en rechts de volgorde binnen een sectie', async () => {
    const gebruiker = userEvent.setup();
    toon({ toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's1', 1)] });

    expect(volgordeRond('u1')).toEqual(['u1', 'u2']);

    await toets(gebruiker, 'u2', '{ArrowLeft}');
    expect(volgordeRond('u1')).toEqual(['u2', 'u1']);

    await toets(gebruiker, 'u2', '{ArrowRight}');
    expect(volgordeRond('u1')).toEqual(['u1', 'u2']);
  });

  it('loopt niet voorbij de rand van een sectie', async () => {
    const gebruiker = userEvent.setup();
    toon({ toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's1', 1)] });

    await toets(gebruiker, 'u1', '{ArrowLeft}');
    expect(volgordeRond('u1')).toEqual(['u1', 'u2']);
    expect(screen.queryByText('seating.unsavedChanges')).not.toBeInTheDocument();
  });

  it('houdt een lid zonder plek waar het is als er geen secties zijn', async () => {
    const gebruiker = userEvent.setup();
    toon({ secties: [] });

    await toets(gebruiker, 'u1', '{ArrowUp}{ArrowDown}{ArrowLeft}{ArrowRight}');

    expect(plekVan('u1')).toContain('seating.unassignedMembers');
    expect(screen.queryByText('seating.unsavedChanges')).not.toBeInTheDocument();
  });
});

describe('SeatingEditor - opslaan', () => {
  it('kan pas opslaan als er iets veranderd is', async () => {
    const gebruiker = userEvent.setup();
    const { opslaan } = toon({});

    const knop = screen.getByText('common.save');
    expect(knop).toBeDisabled();

    await gebruiker.click(screen.getByText('seating.autoAssign'));
    expect(knop).toBeEnabled();

    await gebruiker.click(knop);
    expect(opslaan).toHaveBeenCalledTimes(1);
  });

  it('stuurt elk lid met zijn sectie en plek mee', async () => {
    const gebruiker = userEvent.setup();
    const { opslaan } = toon({});

    await gebruiker.click(screen.getByText('seating.autoAssign'));
    await gebruiker.click(screen.getByText('common.save'));

    expect(opslaan).toHaveBeenCalledWith(
      expect.arrayContaining([
        { userId: 'u1', sectionId: 's1', positionInSection: 0 },
        { userId: 'u2', sectionId: 's2', positionInSection: 0 },
      ]),
    );
    // Carla heeft geen instrument en dus geen plek; zij hoort er niet bij.
    const verstuurd = opslaan.mock.calls[0][0] as { userId: string }[];
    expect(verstuurd.map((r) => r.userId)).not.toContain('u3');
  });

  it('meldt na een geslaagde opslag geen openstaande wijzigingen meer', async () => {
    const gebruiker = userEvent.setup();
    toon({});

    await gebruiker.click(screen.getByText('seating.autoAssign'));
    await gebruiker.click(screen.getByText('common.save'));

    expect(screen.queryByText('seating.unsavedChanges')).not.toBeInTheDocument();
    expect(screen.getByText('common.save')).toBeDisabled();
  });

  /**
   * BEWIJS, maar niet in een verwachting te vangen: de toestand van het scherm
   * klopte al: `setHasChanges(false)` werd bij een afwijzing overgeslagen. Wat
   * er misging zat ernaast: `handleSave` liet de afwijzing als 'unhandled
   * rejection' ontsnappen. In de browser is dat een 'Uncaught (in promise)' die
   * elke foutmelder aan window.onunhandledrejection als crash leest; in deze
   * test liet vitest de uitvoering erop afgaan (Errors: 1, afsluitcode 1)
   * terwijl alle verwachtingen groen stonden. Draai dit bestand tegen de oude
   * SeatingEditor.tsx en het verschil staat onder aan het verslag, niet in een
   * regel.
   */
  it('laat de wijzigingen staan als de server de indeling weigert', async () => {
    const gebruiker = userEvent.setup();
    const weigeren = vi.fn().mockRejectedValue(new Error('stoel al bezet'));
    toon({ opslaan: weigeren });

    await gebruiker.click(screen.getByText('seating.autoAssign'));
    await gebruiker.click(screen.getByText('common.save'));

    // De indeling van de gebruiker mag niet verdwijnen en de knop moet weer
    // klikbaar zijn, zodat hij het opnieuw kan proberen.
    expect(screen.getByText('seating.unsavedChanges')).toBeInTheDocument();
    expect(screen.getByText('common.save')).toBeEnabled();
    expect(plekVan('u1')).toContain('Klarinetten');
  });
});

describe('SeatingEditor - twee leden op dezelfde stoel', () => {
  /**
   * BEWIJS. De server bewaakte alleen dat één lid maar één plek kreeg, niet dat
   * één plek maar aan één lid vergeven werd. Daardoor staan er indelingen in de
   * database waarin twee leden dezelfde positie in dezelfde sectie hebben. De
   * server weigert zo'n indeling nu, en dan weigert hij de héle opslag - ook de
   * verplaatsing die de gebruiker net deed, en die met de botsing niets te
   * maken had.
   *
   * De editor stuurde de posities door zoals ze binnenkwamen. Hij hernummert ze
   * nu bij het opslaan in de volgorde die op het scherm staat, zodat wat de
   * gebruiker ziet ook is wat er wordt opgeslagen. Zonder die reparatie in
   * SeatingEditor.tsx faalt deze test: u1 en u2 gaan dan allebei met
   * positionInSection 0 de deur uit.
   */
  it('hernummert dubbele plekken bij het opslaan', async () => {
    const gebruiker = userEvent.setup();
    const { opslaan } = toon({
      toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's1', 0)],
    });

    // Een verplaatsing die de botsing niet aanraakt: Carla erbij zetten.
    await toets(gebruiker, 'u3', '{ArrowUp}');
    await gebruiker.click(screen.getByText('common.save'));

    const verstuurd = opslaan.mock.calls[0][0] as {
      userId: string;
      sectionId: string;
      positionInSection: number;
    }[];

    const stoelen = verstuurd.map((r) => `${r.sectionId}:${r.positionInSection}`);
    expect(new Set(stoelen).size).toBe(stoelen.length);
    expect(verstuurd).toEqual(
      expect.arrayContaining([
        { userId: 'u1', sectionId: 's1', positionInSection: 0 },
        { userId: 'u2', sectionId: 's1', positionInSection: 1 },
      ]),
    );
  });

  /**
   * BEWIJS. Hetzelfde probleem van de andere kant: wie een lid uit een sectie
   * weghaalt, laat een gat in de nummering achter (0, 2, 3). Dat is op zichzelf
   * niet fout, maar het maakt de plek van een lid afhankelijk van wie er ooit
   * naast zat. Bij het opslaan horen de plekken aaneengesloten te zijn.
   */
  it('sluit de gaten die door verplaatsen ontstaan', async () => {
    const gebruiker = userEvent.setup();
    const { opslaan } = toon({
      toewijzingen: [maakToewijzing('u1', 's1', 0), maakToewijzing('u2', 's1', 1), maakToewijzing('u3', 's1', 2)],
    });

    // Bram naar de sectie eronder; Anna en Carla blijven achter op 0 en 2.
    await toets(gebruiker, 'u2', '{ArrowDown}');
    await gebruiker.click(screen.getByText('common.save'));

    const verstuurd = opslaan.mock.calls[0][0] as {
      userId: string;
      sectionId: string;
      positionInSection: number;
    }[];

    expect(verstuurd).toEqual(
      expect.arrayContaining([
        { userId: 'u1', sectionId: 's1', positionInSection: 0 },
        { userId: 'u3', sectionId: 's1', positionInSection: 1 },
        { userId: 'u2', sectionId: 's2', positionInSection: 0 },
      ]),
    );
  });
});
