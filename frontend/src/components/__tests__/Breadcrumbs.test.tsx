/**
 * Broodkruimels: welk pad levert welke kruimels op?
 *
 * De hele component is één vertaling van `location.pathname` naar een rij
 * kruimels, dus daar gaan deze tests over. Niet over het feit dát er iets
 * getekend wordt, maar over wat er staat, wat een link is en waar die link
 * heen wijst. Een broodkruimel die nergens heen gaat is namelijk erger dan
 * geen broodkruimel: hij belooft een weg terug die er niet is.
 *
 * De vertalingen komen uit nl.json in plaats van uit een `t`-die-de-sleutel-
 * teruggeeft. Dat kost niets en het levert iets op: de tests lezen als het
 * scherm ("Lijsten", "Orkest") en een ontbrekende sleutel valt meteen op in
 * plaats van dat hij als 'nav.lists' door de test heen glipt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs, setBreadcrumbContext, clearBreadcrumbContext } from '../Breadcrumbs';

vi.mock('react-i18next', async () => {
  // De opzoeker staat binnen de fabriek: `vi.mock` wordt naar boven getild en
  // draait vóór de moduleregels hieronder, dus een verwijzing naar iets van
  // buitenaf zou nog niet bestaan.
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
    }),
  };
});

function toon(pad: string) {
  return render(
    <MemoryRouter initialEntries={[pad]}>
      <Breadcrumbs />
    </MemoryRouter>,
  );
}

/** De kruimels op volgorde, zoals een bezoeker ze leest (zonder de scheidingstekens). */
function kruimels(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
    .map((tekst) => tekst.replace(/\/$/, '').trim());
}

describe('broodkruimels: welk pad geeft welke kruimels', () => {
  it('toont niets op het dashboard zelf', () => {
    const { container } = toon('/');

    expect(container).toBeEmptyDOMElement();
  });

  it('zet het dashboard voorop en de huidige pagina achteraan', () => {
    toon('/tools');

    expect(kruimels()).toEqual(['Dashboard', 'Tools']);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
  });

  it('maakt van de huidige pagina geen link maar de aangekondigde huidige plek', () => {
    toon('/tools');

    expect(screen.queryByRole('link', { name: 'Tools' })).not.toBeInTheDocument();
    expect(screen.getByText('Tools')).toHaveAttribute('aria-current', 'page');
  });

  it('geeft de navigatie een naam voor de schermlezer', () => {
    toon('/tools');

    expect(screen.getByRole('navigation', { name: 'Breadcrumb navigatie' })).toBeInTheDocument();
  });

  it('toont niets voor een pad dat niet in de tabel staat', () => {
    // Een onbekend pad levert alleen het dashboard op, en één kruimel is geen
    // spoor. Dan hoort er niets te staan in plaats van een eenzame link naar
    // huis die niets vertelt over waar je bent.
    const { container } = toon('/deze-pagina-bestaat-niet');

    expect(container).toBeEmptyDOMElement();
  });

  it('valt terug op de bekende basis als alleen het vervolg onbekend is', () => {
    toon('/tools/metronoom');

    expect(kruimels()).toEqual(['Dashboard', 'Tools']);
  });

  it.each([
    ['/rehearsals', ['Dashboard', 'Repetities']],
    ['/music-pieces', ['Dashboard', 'Muziekstukken']],
    ['/users', ['Dashboard', 'Leden']],
    ['/my-music', ['Dashboard', 'Mijn Muziek']],
  ])('vertaalt %s naar %s', (pad, verwacht) => {
    toon(pad);

    expect(kruimels()).toEqual(verwacht);
  });

  it('bouwt de keten van een detailpagina op uit de tabel met geneste routes', () => {
    toon('/rehearsals/42');

    expect(kruimels()).toEqual(['Dashboard', 'Repetities', 'Repetitie']);
    expect(screen.getByRole('link', { name: 'Repetities' })).toHaveAttribute('href', '/rehearsals');
    expect(screen.getByText('Repetitie')).toHaveAttribute('aria-current', 'page');
  });

  it('zet de meegegeven naam in plaats van het algemene woord', () => {
    setBreadcrumbContext('/rehearsals/42', 'Generale repetitie');
    toon('/rehearsals/42');

    expect(kruimels()).toEqual(['Dashboard', 'Repetities', 'Generale repetitie']);
  });

  it('gebruikt die naam alleen op het pad waar hij bij hoort', () => {
    setBreadcrumbContext('/rehearsals/42', 'Generale repetitie');
    toon('/rehearsals/43');

    expect(kruimels()).toEqual(['Dashboard', 'Repetities', 'Repetitie']);
  });

  afterEach(() => {
    // De context leeft op moduleniveau en overleeft dus een test. Zonder deze
    // opruiming lekt de naam naar de volgende test.
    clearBreadcrumbContext('/rehearsals/42');
    clearBreadcrumbContext('/email-campaigns/7');
  });
});

describe('broodkruimels: geen enkele link mag doodlopen', () => {
  /**
   * BEWIJS (bug A). Op /lists/:orchestraId/:listId - de enige echt bestaande
   * geneste route in App.tsx - stond "Orkest" als link naar /lists/:orchestraId.
   * Die route bestaat niet: App.tsx kent alleen `lists` en
   * `lists/:orchestraId/:listId`, en alles wat daar niet op past valt in de
   * catch-all met <NotFound />. De bezoeker klikte dus vanuit zijn eigen
   * lijst op een kruimel en belandde op een 404.
   *
   * Deze test is rood op de oude code: daar is "Orkest" een <a href="/lists/o1">
   * en vindt `getByRole('link', { name: 'Orkest' })` hem gewoon.
   *
   * De reparatie laat het niveau staan - het is een echte stap in de
   * hiërarchie en de bezoeker mag zien waar hij zit - maar zonder link.
   */
  it('maakt van het orkestniveau geen link, want die pagina bestaat niet', () => {
    toon('/lists/o1/l1');

    expect(kruimels()).toEqual(['Dashboard', 'Lijsten', 'Orkest', 'Lijst']);
    expect(screen.getByText('Orkest')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Orkest' })).not.toBeInTheDocument();
  });

  it('kondigt dat tussenniveau ook niet aan als de huidige pagina', () => {
    // WACHT, geen bewijs: deze test was ook op de oude code groen. Daar was
    // "Orkest" een link, en een link draagt geen aria-current. Hij staat hier
    // om de reparatie hierboven vast te zetten: wie het linkje weghaalt mag er
    // niet zomaar aria-current="page" van maken, want dan zegt de schermlezer
    // twee keer "huidige pagina" op één spoor.
    toon('/lists/o1/l1');

    expect(screen.getByText('Orkest')).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('[aria-current="page"]'))).toHaveLength(1);
  });

  it('wijst de overgebleven links naar routes die wel bestaan', () => {
    toon('/lists/o1/l1');

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Lijsten' })).toHaveAttribute('href', '/lists');
    expect(screen.getByText('Lijst')).toHaveAttribute('aria-current', 'page');
  });

  /**
   * BEWIJS (bug B). Een detailpagina buiten de tabel met geneste routes krijgt
   * zijn naam via `setBreadcrumbContext`. De sectiekruimel ervoor was dan geen
   * link meer én droeg net als de detailkruimel aria-current="page": twee keer
   * "huidige pagina" in één spoor, en geen weg terug naar de sectie.
   *
   * Rood op de oude code: daar bestaat er geen link 'E-mailcampagnes' en
   * levert de telling van aria-current twee treffers op.
   */
  it('houdt de sectie klikbaar als er nog een detailkruimel achter komt', () => {
    setBreadcrumbContext('/email-campaigns/7', 'Zomeractie');
    toon('/email-campaigns/7');

    expect(kruimels()).toEqual(['Dashboard', 'E-mailcampagnes', 'Zomeractie']);
    expect(screen.getByRole('link', { name: 'E-mailcampagnes' })).toHaveAttribute('href', '/email-campaigns');
    expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('[aria-current="page"]'))).toHaveLength(1);
    expect(screen.getByText('Zomeractie')).toHaveAttribute('aria-current', 'page');
  });

  afterEach(() => {
    clearBreadcrumbContext('/email-campaigns/7');
  });
});

describe('broodkruimels: een lang spoor wordt ingeklapt', () => {
  const diepPad = '/lists/o1/l1/t1';

  it('laat bij vijf kruimels alleen het begin en de laatste twee zien', () => {
    toon(diepPad);

    // Dashboard, de knop met de puntjes, Lijst en Titel.
    expect(screen.queryByText('Orkest')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toon meer broodkruimels' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lijst' })).toHaveAttribute('href', '/lists/o1/l1');
    expect(screen.getByText('Titel')).toHaveAttribute('aria-current', 'page');
  });

  it('geeft de verborgen kruimels prijs na een klik op de puntjes', async () => {
    const gebruiker = userEvent.setup();
    toon(diepPad);

    const knop = screen.getByRole('button', { name: 'Toon meer broodkruimels' });
    expect(knop).toHaveAttribute('aria-expanded', 'false');

    await gebruiker.click(knop);

    const menu = screen.getByRole('menu');
    expect(knop).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Lijsten' })).toHaveAttribute('href', '/lists');
    expect(within(menu).getByText('Orkest')).toBeInTheDocument();
  });

  it('zet ook in dat uitklapmenu geen link onder een niveau zonder pagina', async () => {
    // Dezelfde doodlopende weg als hierboven, maar dan in het uitklapmenu:
    // daar werd `item.path || '#'` gebruikt, wat van elke pathloze kruimel een
    // link naar '#' maakte.
    const gebruiker = userEvent.setup();
    toon(diepPad);

    await gebruiker.click(screen.getByRole('button', { name: 'Toon meer broodkruimels' }));

    expect(screen.queryByRole('menuitem', { name: 'Orkest' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu').querySelector('a[href="#"]')).toBeNull();
  });

  it('klapt het menu weer dicht bij een klik ernaast', async () => {
    const gebruiker = userEvent.setup();
    toon(diepPad);

    await gebruiker.click(screen.getByRole('button', { name: 'Toon meer broodkruimels' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await gebruiker.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('brengt de bezoeker naar de kruimel die hij in het menu kiest', async () => {
    const gebruiker = userEvent.setup();
    toon(diepPad);

    await gebruiker.click(screen.getByRole('button', { name: 'Toon meer broodkruimels' }));
    await gebruiker.click(screen.getByRole('menuitem', { name: 'Lijsten' }));

    expect(kruimels()).toEqual(['Dashboard', 'Lijsten']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
