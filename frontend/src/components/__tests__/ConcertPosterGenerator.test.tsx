/**
 * De postergenerator: de velden, de sjablonen en wat er bij het downloaden
 * gebeurt.
 *
 * Het tekenwerk zelf gaat via html2canvas, en dat is hier afgevangen. Dat kost
 * niets aan zeggingskracht: het voorbeeld dat de gebruiker op het scherm ziet
 * is gewoon HTML, en html2canvas komt er pas aan te pas op het moment dat er
 * een bestand van gemaakt wordt. Wat er dan gebeurt - welk element wordt
 * gefotografeerd, hoe het bestand heet, wat de aanroeper te horen krijgt - is
 * te controleren zonder ooit een echte pixel te vergelijken.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nl from '../../locales/nl.json';

/** Wat html2canvas oplevert; per test in te stellen. */
const tekenPlaat = vi.fn();

vi.mock('html2canvas', () => ({ default: (...args: unknown[]) => tekenPlaat(...args) }));

vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false }) }));

vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} /> }));

function vertaal(sleutel: string, standaard?: string): string {
  const waarde = sleutel.split('.').reduce<unknown>((tak, deel) => {
    return tak && typeof tak === 'object' ? (tak as Record<string, unknown>)[deel] : undefined;
  }, nl);
  return typeof waarde === 'string' ? waarde : (standaard ?? sleutel);
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: vertaal }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { ConcertPosterGenerator } from '../ConcertPosterGenerator';

/** Elke download die de browser te verwerken kreeg. */
let downloads: { naam: string; bron: string }[] = [];

beforeEach(() => {
  downloads = [];
  tekenPlaat.mockReset();
  tekenPlaat.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,AAAA' });

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ naam: this.download, bron: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Het voorbeeld dat op het scherm staat (niet de kopie die gefotografeerd wordt). */
function voorbeeld(): HTMLElement {
  return document.querySelector('.preview-container .poster-preview') as HTMLElement;
}

function toon(props: Partial<Parameters<typeof ConcertPosterGenerator>[0]> = {}) {
  const gedownload = vi.fn();
  render(<ConcertPosterGenerator onDownload={gedownload} {...props} />);
  return { gedownload, gebruiker: userEvent.setup({ delay: null }) };
}

describe('de velden en het voorbeeld', () => {
  // De poster wordt bij elke aanslag opnieuw getekend, dus de teksten zijn
  // kort gehouden. Wat ze zijn doet er niet toe; dat ze op de poster
  // terechtkomen wel.
  it('zet naam, titel en ondertitel meteen op de poster', async () => {
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('Orkest / Vereniging'), 'Concordia');
    await gebruiker.type(screen.getByLabelText('Titel'), 'Nieuwjaar');
    await gebruiker.type(screen.getByLabelText('Ondertitel (optioneel)'), 'met koor');

    const poster = voorbeeld();
    expect(within(poster).getByText('Concordia')).toBeInTheDocument();
    expect(within(poster).getByText('Nieuwjaar')).toBeInTheDocument();
    expect(within(poster).getByText('met koor')).toBeInTheDocument();
  });

  it('zet locatie, adres en ticketinformatie meteen op de poster', async () => {
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('Locatie'), 'De Zaal');
    await gebruiker.type(screen.getByLabelText('Adres (optioneel)'), 'Kerkstraat 1');
    await gebruiker.type(screen.getByLabelText('Ticketinformatie'), 'Gratis');

    const poster = voorbeeld();
    expect(within(poster).getByText('De Zaal')).toBeInTheDocument();
    expect(within(poster).getByText('Kerkstraat 1')).toBeInTheDocument();
    expect(within(poster).getByText('Gratis')).toBeInTheDocument();
  });

  it('toont invulteksten zolang er nog niets ingevuld is', () => {
    toon();

    const poster = voorbeeld();
    expect(within(poster).getByText('Concerttitel')).toBeInTheDocument();
    expect(within(poster).getByText('Locatie')).toBeInTheDocument();
    expect(within(poster).getByText('20:00')).toBeInTheDocument();
  });

  it('begint met de gegevens die de aanroeper meegeeft', () => {
    toon({ initialData: { title: 'Kerstconcert', orchestraName: 'Excelsior', time: '19:30' } });

    expect(screen.getByLabelText('Titel')).toHaveValue('Kerstconcert');
    expect(within(voorbeeld()).getByText('Kerstconcert')).toBeInTheDocument();
    expect(within(voorbeeld()).getByText('19:30')).toBeInTheDocument();
  });

  it('schrijft de datum voluit op de poster', async () => {
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('Datum'), '2026-12-24');

    // De taal van de datum volgt de taal van de applicatie (via
    // utils/locale.ts), en die staat in deze opzet niet op Nederlands. Wat
    // hier telt is dat de datum voluit geschreven wordt en niet als
    // "2026-12-24" blijft staan: dag, dagnummer, maand en jaar.
    const datum = within(voorbeeld()).getByText((tekst) => tekst.includes('24') && tekst.includes('2026'));
    expect(datum).toBeInTheDocument();
    expect(datum.textContent).not.toContain('2026-12-24');
    expect(datum.textContent!.split(' ').length).toBeGreaterThanOrEqual(4);
  });

  it('maakt van elke regel in het programma een werk', async () => {
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('Werken (een per regel)'), 'Mozart{Enter}Ravel{Enter}{Enter}Dvorak');

    const poster = voorbeeld();
    expect(within(poster).getByText('Mozart')).toBeInTheDocument();
    expect(within(poster).getByText('Ravel')).toBeInTheDocument();
    expect(within(poster).getByText('Dvorak')).toBeInTheDocument();
    // De lege regel ertussen levert geen leeg werk op: drie werken, niet vier.
    expect(within(poster).getAllByText(/^(Mozart|Ravel|Dvorak)$/)).toHaveLength(3);
  });

  it('laat stilletjes werken weg zodra het er te veel worden', async () => {
    // Vastgelegd, niet goedgekeurd: het klassieke sjabloon toont er vijf en de
    // andere twee vier, en wie er zes intypt krijgt daar niets over te horen.
    // Zonder een ontwerpkeuze over de ruimte op een poster van 600x800 is dit
    // niet te repareren; wel is het iets om te weten.
    const { gebruiker } = toon();

    await gebruiker.type(
      screen.getByLabelText('Werken (een per regel)'),
      'een{Enter}twee{Enter}drie{Enter}vier{Enter}vijf{Enter}zes',
    );

    expect(within(voorbeeld()).queryByText('zes')).not.toBeInTheDocument();
    expect(within(voorbeeld()).getByText('vijf')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Modern' }));
    expect(within(voorbeeld()).queryByText('vijf')).not.toBeInTheDocument();
    expect(within(voorbeeld()).getByText('vier')).toBeInTheDocument();
  });
});

describe('sjabloon en kleuren', () => {
  it('wisselt van sjabloon', async () => {
    const { gebruiker } = toon({ initialData: { title: 'Nieuwjaar' } });

    expect(voorbeeld()).toHaveStyle({ fontFamily: 'Georgia, serif' });

    await gebruiker.click(screen.getByRole('button', { name: 'Modern' }));
    expect(voorbeeld()).toHaveStyle({ fontFamily: 'system-ui, sans-serif' });
    expect(within(voorbeeld()).getByText('Nieuwjaar')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Minimaal' }));
    expect(within(voorbeeld()).getByText('Nieuwjaar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimaal' })).toHaveClass('active');
  });

  it('kleurt de poster om bij een ander thema', async () => {
    const { gebruiker } = toon();
    expect(voorbeeld()).toHaveStyle({ backgroundColor: '#f5f5f0' });

    await gebruiker.click(screen.getByRole('button', { name: 'Midnight' }));

    expect(voorbeeld()).toHaveStyle({ backgroundColor: '#1e293b' });
  });

  it("neemt eigen kleurthema's van de aanroeper over", async () => {
    const eigen = {
      id: 'clubkleuren',
      name: 'Clubkleuren',
      primary: '#112233',
      secondary: '#445566',
      background: '#aabbcc',
      text: '#000000',
      accent: '#ff0000',
    };
    const { gebruiker } = toon({ customThemes: [eigen] });

    await gebruiker.click(screen.getByRole('button', { name: 'Clubkleuren' }));

    expect(voorbeeld()).toHaveStyle({ backgroundColor: '#aabbcc' });
  });
});

describe('het logo', () => {
  it('zet een gekozen bestand op de poster en haalt het er weer af', async () => {
    const { gebruiker } = toon();

    await gebruiker.upload(
      screen.getByLabelText('Logo uploaden'),
      new File(['logo'], 'logo.png', { type: 'image/png' }),
    );

    const afbeelding = await screen.findByAltText('Logo voorbeeld');
    expect(afbeelding).toHaveAttribute('src', expect.stringContaining('data:'));
    await waitFor(() => expect(within(voorbeeld()).getByRole('img')).toBeInTheDocument());

    await gebruiker.click(screen.getByRole('button', { name: '' }) ?? screen.getByTestId('icoon-close'));
    await waitFor(() => expect(screen.queryByAltText('Logo voorbeeld')).not.toBeInTheDocument());
  });
});

describe('downloaden', () => {
  it('fotografeert de poster en biedt hem als png aan', async () => {
    const { gebruiker, gedownload } = toon();
    await gebruiker.type(screen.getByLabelText('Titel'), 'Nieuwjaar');

    await gebruiker.click(screen.getByRole('button', { name: /Downloaden als PNG/ }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].naam).toBe('concert-poster-Nieuwjaar.png');
    expect(downloads[0].bron).toContain('data:image/png');

    // Wat er gefotografeerd is, is een kopie van de poster op ware grootte.
    const gefotografeerd = tekenPlaat.mock.calls[0][0] as HTMLElement;
    expect(gefotografeerd.style.width).toBe('600px');
    expect(gefotografeerd.style.height).toBe('800px');
    expect(gefotografeerd).toHaveClass('poster-preview');

    expect(gedownload).toHaveBeenCalledWith('png', expect.objectContaining({ title: 'Nieuwjaar' }));
  });

  it('valt zonder titel terug op een vaste bestandsnaam', async () => {
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: /Downloaden als PNG/ }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].naam).toBe('concert-poster-poster.png');
  });

  it('levert bij de pdf-knop nog steeds een png', async () => {
    // Vastgelegd, niet goedgekeurd. De knop heet PDF, maar wat eruit komt is
    // een png met een png-naam; dat staat zo in de bron ("simplified
    // implementation") en een echte pdf vraagt om een bibliotheek die er niet
    // is. De aanroeper krijgt wel 'pdf' te horen, dus wie daar een melding op
    // baseert, meldt iets wat niet klopt.
    const { gebruiker, gedownload } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'PDF' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].naam).toMatch(/\.png$/);
    expect(gedownload).toHaveBeenCalledWith('pdf', expect.anything());
  });

  it('meldt het onderweg en laat de knoppen daarna weer los', async () => {
    let losmaken: (waarde: unknown) => void = () => {};
    tekenPlaat.mockReturnValue(new Promise((resolve) => (losmaken = resolve)));
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: /Downloaden als PNG/ }));

    expect(await screen.findByText('Genereren...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();

    losmaken({ toDataURL: () => 'data:image/png;base64,AAAA' });

    await waitFor(() => expect(screen.getByRole('button', { name: /Downloaden als PNG/ })).toBeEnabled());
  });

  /**
   * BEWIJS van een echte fout.
   *
   * Om de poster op ware grootte te kunnen fotograferen wordt er een kopie van
   * gemaakt en buiten beeld in de pagina gehangen. Het opruimen van die kopie
   * stond op de regel ná het fotograferen, en dus gebeurde het niet zodra het
   * fotograferen misging. Elke mislukte poging liet zo een volledige kopie van
   * de poster in de pagina achter - inclusief het logo, dat gewoon blijft
   * hangen - en die kopie gaat pas weg als de gebruiker de pagina ververst.
   *
   * Rood zonder de reparatie: de test faalde op de laatste regel met twee
   * gevonden posters in plaats van één (het voorbeeld op het scherm plus de
   * achtergebleven kopie).
   */
  it('ruimt de kopie op wanneer het fotograferen misgaat', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tekenPlaat.mockRejectedValue(new Error('canvas geeft het op'));
    const { gebruiker, gedownload } = toon();

    await gebruiker.click(screen.getByRole('button', { name: /Downloaden als PNG/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Downloaden als PNG/ })).toBeEnabled());
    expect(downloads).toHaveLength(0);
    expect(gedownload).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.poster-preview')).toHaveLength(1);
  });
});
