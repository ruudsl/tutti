/**
 * Het snelmenu: welke acties krijgt wie te zien, en wat doen ze?
 *
 * Twee dingen bepalen de inhoud van dit menu: het pad waar de bezoeker staat
 * en zijn rol. Beide worden hieronder uitgeprobeerd, want een snelmenu dat op
 * de repetitiepagina de acties van het dashboard toont is nutteloos, en een
 * gewoon lid dat "Nieuw lid" ziet staan krijgt straks een foutmelding van de
 * server in plaats van een scherm.
 *
 * Daarnaast is dit menu vooral toetsenbordwerk (Ctrl+., pijltjes, Enter,
 * Escape, sneltoetsen). Dat is precies het soort gedrag dat stilletjes stukgaat
 * omdat niemand het met de muis merkt, dus dat staat hier apart.
 *
 * De vertalingen komen uit nl.json, zodat de tests lezen als het scherm.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QuickActionsMenu } from '../QuickActionsMenu';
import { ROLES } from '../../utils/constants';

const { aanmelding, router } = vi.hoisted(() => ({
  aanmelding: { user: null as { role: string } | null },
  router: { navigeer: vi.fn() },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: aanmelding.user }),
}));

vi.mock('react-router-dom', async (echt) => {
  const module = await echt<typeof import('react-router-dom')>();
  return { ...module, useNavigate: () => router.navigeer };
});

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
    }),
  };
});

function toon(pad = '/', onOpenSearch?: () => void) {
  return render(
    <MemoryRouter initialEntries={[pad]}>
      {/* Een invoerveld ernaast: de sneltoetsen horen te zwijgen zolang
          iemand aan het typen is. */}
      <input aria-label="Zoekveld van de pagina" />
      <QuickActionsMenu onOpenSearch={onOpenSearch} />
    </MemoryRouter>,
  );
}

function fab() {
  return screen.getByRole('button', { name: 'Snelle acties' });
}

/** De acties op volgorde, zoals ze in het geopende menu staan. */
function acties(): string[] {
  return screen.getAllByRole('menuitem').map((knop) => knop.querySelector('.quick-action-label')?.textContent ?? '');
}

async function open(pad = '/', onOpenSearch?: () => void) {
  const gebruiker = userEvent.setup();
  toon(pad, onOpenSearch);
  await gebruiker.click(fab());
  return gebruiker;
}

beforeEach(() => {
  aanmelding.user = { role: ROLES.ADMIN };
  router.navigeer.mockClear();
});

describe('snelmenu: openen en sluiten', () => {
  it('begint dicht en verraadt dat aan de schermlezer', () => {
    toon();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fab()).toHaveAttribute('aria-expanded', 'false');
    expect(fab()).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('gaat open bij een klik op de knop', async () => {
    await open();

    expect(screen.getByRole('menu', { name: 'Snelle acties' })).toBeInTheDocument();
    expect(fab()).toHaveAttribute('aria-expanded', 'true');
  });

  it('gaat weer dicht bij een tweede klik', async () => {
    const gebruiker = await open();

    await gebruiker.click(fab());

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('gaat dicht bij een klik ernaast', async () => {
    const gebruiker = await open();

    await gebruiker.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('vertelt waar de acties over gaan', async () => {
    await open('/tools');

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Acties voor deze pagina')).toBeInTheDocument();
  });
});

describe('snelmenu: de acties horen bij de pagina', () => {
  it('biedt op het dashboard de eerste stappen aan', async () => {
    await open('/');

    expect(acties()).toEqual(['Zoeken', 'Nieuwe lijst', 'Uploaden', 'Repetities bekijken', 'Mijn Muziek']);
  });

  it('biedt op mijn muziek de acties van die pagina aan', async () => {
    await open('/my-music');

    expect(acties()).toEqual(['Zoeken', 'Alles downloaden', 'Probleem melden', 'Favorieten bekijken']);
  });

  it('biedt op een lijstpagina de lijstacties aan, ook diep in het pad', async () => {
    await open('/lists/o1/l1');

    expect(acties()).toEqual(['Zoeken', 'Stuk toevoegen', 'Lijst exporteren', 'Lijst afdrukken']);
  });

  it.each([
    ['/titles', 'Nieuwe titel'],
    ['/music-pieces', 'Nieuwe titel'],
    ['/rehearsals', 'Nieuwe repetitie'],
    ['/members', 'Nieuw lid'],
    ['/equipment', 'Nieuw item'],
    ['/uniforms', 'Nieuw item'],
    ['/tools', 'Metronoom'],
  ])('biedt op %s de actie %s aan', async (pad, actie) => {
    await open(pad);

    expect(acties()).toContain(actie);
  });

  it('valt op een pagina zonder eigen acties terug op de vaste bestemmingen', async () => {
    await open('/statistics');

    expect(acties()).toEqual(['Zoeken', 'Dashboard', 'Mijn Muziek', 'Lijsten', 'Repetities']);
  });
});

describe('snelmenu: alleen wat je mag', () => {
  it('houdt beheerderacties weg bij een gewoon lid', async () => {
    aanmelding.user = { role: ROLES.MEMBER };
    await open('/');

    expect(acties()).toEqual(['Zoeken', 'Repetities bekijken', 'Mijn Muziek']);
  });

  it('toont ze wel aan de muziekcommissie', async () => {
    aanmelding.user = { role: ROLES.MUSIC_COMMITTEE };
    await open('/');

    expect(acties()).toContain('Nieuwe lijst');
  });

  it('geeft de muziekcommissie niet de acties van een andere commissie', async () => {
    aanmelding.user = { role: ROLES.MUSIC_COMMITTEE };
    await open('/equipment');

    expect(acties()).toEqual(['Zoeken']);
  });

  it('laat de beheerder overal bij', async () => {
    aanmelding.user = { role: ROLES.ADMIN };
    await open('/equipment');

    expect(acties()).toEqual(['Zoeken', 'Nieuw item', 'Nieuwe uitlening']);
  });

  it('toont zonder ingelogde gebruiker alleen de acties zonder rolvereiste', async () => {
    aanmelding.user = null;
    await open('/');

    expect(acties()).toEqual(['Zoeken', 'Repetities bekijken', 'Mijn Muziek']);
  });
});

describe('snelmenu: wat een actie doet', () => {
  it('brengt de bezoeker naar de pagina van de actie en sluit het menu', async () => {
    const gebruiker = await open('/');

    await gebruiker.click(screen.getByRole('menuitem', { name: /Nieuwe lijst/ }));

    expect(router.navigeer).toHaveBeenCalledWith('/lists?action=new');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('roept de zoekfunctie van de pagina aan', async () => {
    const zoeken = vi.fn();
    const gebruiker = await open('/', zoeken);

    await gebruiker.click(screen.getByRole('menuitem', { name: /Zoeken/ }));

    expect(zoeken).toHaveBeenCalledTimes(1);
    expect(router.navigeer).not.toHaveBeenCalled();
  });

  it('seint de pagina in via een gebeurtenis in plaats van te navigeren', async () => {
    const geluisterd = vi.fn();
    window.addEventListener('quick-action-download-all', geluisterd);
    const gebruiker = await open('/my-music');

    await gebruiker.click(screen.getByRole('menuitem', { name: /Alles downloaden/ }));

    expect(geluisterd).toHaveBeenCalledTimes(1);
    expect(router.navigeer).not.toHaveBeenCalled();
    window.removeEventListener('quick-action-download-all', geluisterd);
  });

  it.each([
    ['/tools', /Metronoom/, 'quick-action-metronome'],
    ['/tools', /Stemapparaat/, 'quick-action-tuner'],
    ['/lists', /Lijst exporteren/, 'quick-action-export-list'],
    ['/rehearsals', /Agenda bekijken/, 'quick-action-calendar-view'],
  ])('stuurt vanaf %s bij %s de gebeurtenis %s', async (pad, naam, gebeurtenis) => {
    const geluisterd = vi.fn();
    window.addEventListener(gebeurtenis, geluisterd);
    const gebruiker = await open(pad);

    await gebruiker.click(screen.getByRole('menuitem', { name: naam }));

    expect(geluisterd).toHaveBeenCalledTimes(1);
    window.removeEventListener(gebeurtenis, geluisterd);
  });
});

describe('snelmenu: bediening met het toetsenbord', () => {
  it('opent en sluit met Ctrl+.', async () => {
    const gebruiker = userEvent.setup();
    toon('/');

    await gebruiker.keyboard('{Control>}.{/Control}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await gebruiker.keyboard('{Control>}.{/Control}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('zwijgt zolang de bezoeker in een invoerveld typt', async () => {
    const gebruiker = userEvent.setup();
    toon('/');

    await gebruiker.click(screen.getByLabelText('Zoekveld van de pagina'));
    await gebruiker.keyboard('{Control>}.{/Control}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sluit met Escape en geeft de aandacht terug aan de knop', async () => {
    const gebruiker = await open('/');

    await gebruiker.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fab()).toHaveFocus();
  });

  it('loopt met de pijltjes langs de acties', async () => {
    const gebruiker = await open('/');

    await gebruiker.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Zoeken/ })).toHaveClass('selected');

    await gebruiker.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Nieuwe lijst/ })).toHaveClass('selected');
    expect(screen.getByRole('menuitem', { name: /Zoeken/ })).not.toHaveClass('selected');
  });

  it('springt met pijl omhoog naar de laatste actie', async () => {
    const gebruiker = await open('/');

    await gebruiker.keyboard('{ArrowUp}');

    expect(screen.getByRole('menuitem', { name: /Mijn Muziek/ })).toHaveClass('selected');
  });

  it('rolt aan het eind van de lijst weer naar de eerste actie', async () => {
    const gebruiker = await open('/my-music');

    // Vier acties, en de keuze begint bij niets: de vierde druk staat op de
    // laatste actie, de vijfde rolt weer naar de eerste.
    await gebruiker.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Favorieten bekijken/ })).toHaveClass('selected');

    await gebruiker.keyboard('{ArrowDown}');

    expect(screen.getByRole('menuitem', { name: /Zoeken/ })).toHaveClass('selected');
  });

  it('voert met Enter de gekozen actie uit', async () => {
    const gebruiker = await open('/');

    await gebruiker.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(router.navigeer).toHaveBeenCalledWith('/lists?action=new');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('doet niets met Enter zolang er niets gekozen is', async () => {
    // Met Ctrl+. geopend blijft de aandacht op de pagina staan. Was het menu
    // met een muisklik geopend, dan staat de aandacht op de knop en bedient
    // Enter die knop - dat is het gedrag van een knop, niet van dit menu.
    const gebruiker = userEvent.setup();
    toon('/');
    await gebruiker.keyboard('{Control>}.{/Control}');

    await gebruiker.keyboard('{Enter}');

    expect(router.navigeer).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('voert de sneltoets uit die naast de actie staat', async () => {
    const zoeken = vi.fn();
    const gebruiker = await open('/', zoeken);

    expect(within(screen.getByRole('menuitem', { name: /Zoeken/ })).getByText('K')).toBeInTheDocument();
    await gebruiker.keyboard('k');

    expect(zoeken).toHaveBeenCalledTimes(1);
  });

  it('gebruikt die sneltoets alleen als het menu open staat', async () => {
    const zoeken = vi.fn();
    const gebruiker = userEvent.setup();
    toon('/', zoeken);

    await gebruiker.keyboard('k');

    expect(zoeken).not.toHaveBeenCalled();
  });

  it('volgt de muis: hoveren kiest dezelfde actie als de pijltjes', async () => {
    const gebruiker = await open('/');

    await gebruiker.hover(screen.getByRole('menuitem', { name: /Uploaden/ }));

    expect(screen.getByRole('menuitem', { name: /Uploaden/ })).toHaveClass('selected');
  });
});

afterEach(() => {
  aanmelding.user = null;
});
