/**
 * Het pdf-gereedschap, van bestand kiezen tot resultaat ophalen.
 *
 * De pagina heeft drie tabbladen die elk hun eigen weg door dezelfde code
 * lopen: een pdf opsplitsen in partijen, een A3-vel in tweeën delen en losse
 * bestanden samenvoegen. Er lag alleen een test over de labels; alles wat er
 * ná het invullen gebeurt - de aanroep naar de server, wat de gebruiker
 * daarna te zien krijgt, en wat er bij een mislukking gemeld wordt - was
 * ongedekt.
 *
 * De api-laag (`api/pdf-tools` en `savePdfAsMusicPiece`) is weggemockt: die
 * heeft zijn eigen tests, en het gaat hier om wat de pagina ermee doet. De
 * voorbeeldweergave tekent met pdf.js en hoort daarom evenmin bij deze test.
 * `showSuccess`/`showError` staan hier voor wat de gebruiker te horen krijgt;
 * de echte toast heeft een Toaster in de boom nodig en zegt verder niets meer
 * dan de tekst die erin gaat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import PdfTools from '../PdfTools';
import { getPdfInfo, splitPdf, splitPdfA3, mergePdfs, downloadPdfZip } from '../../api/pdf-tools';
import { savePdfAsMusicPiece } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { withDownloadToken } from '../../utils/downloadUrl';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties === 'object' ? `${sleutel}(${Object.values(opties).join(',')})` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/PdfPagePreview', () => ({ default: () => <div data-testid="pdf-voorbeeld" /> }));

vi.mock('../../api', () => ({ savePdfAsMusicPiece: vi.fn() }));
vi.mock('../../api/pdf-tools');
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('../../utils/downloadUrl', () => ({ withDownloadToken: vi.fn() }));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'orkest-1', name: 'Harmonie Sint Cecilia' }] }),
}));
vi.mock('../../hooks/useMusicLists', () => ({
  useMusicLists: () => ({ data: [{ id: 'lijst-1', name: 'Kerstconcert' }] }),
}));
vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: [
      { id: 'inst-trompet', name: 'Trompet', tuning: 'Bb', clef: 'sol' },
      { id: 'inst-hoorn', name: 'Hoorn', tuning: 'F', clef: 'sol' },
    ],
  }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PDF_INFO = {
  filename: 'Mars_van_de_Vrijheid.pdf',
  pageCount: 4,
  pages: [
    { pageNumber: 1, width: 595, height: 842, widthMm: 210, heightMm: 297, paperSize: 'A4', isLandscape: false },
    { pageNumber: 2, width: 595, height: 842, widthMm: 210, heightMm: 297, paperSize: 'A4', isLandscape: false },
    { pageNumber: 3, width: 842, height: 1191, widthMm: 297, heightMm: 420, paperSize: 'A3', isLandscape: false },
    { pageNumber: 4, width: 595, height: 842, widthMm: 210, heightMm: 297, paperSize: 'A4', isLandscape: false },
  ],
};

let vensterOpen: ReturnType<typeof vi.fn>;
let geopendVenster: { location: { href: string }; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('token', 'jwt-voor-de-test');
  vi.mocked(getPdfInfo).mockResolvedValue(PDF_INFO);
  vi.mocked(withDownloadToken).mockResolvedValue('https://tutti.test/pdf.pdf?token=kort');

  // Het downloaden opent een venster; jsdom heeft daar geen echte
  // uitvoering voor, dus hier staat er een die onthoudt waar hij heen ging.
  geopendVenster = { location: { href: '' }, close: vi.fn() };
  vensterOpen = vi.fn(() => geopendVenster);
  window.open = vensterOpen as unknown as typeof window.open;
});

/** Kies een pdf op het geopende tabblad en wacht tot de gegevens er zijn. */
async function kiesPdf(gebruiker: ReturnType<typeof userEvent.setup>, naam = 'Mars_van_de_Vrijheid.pdf') {
  const bestand = new File(['%PDF-1.4'], naam, { type: 'application/pdf' });
  await gebruiker.upload(screen.getByLabelText('pdfTools.pdfFile'), bestand);
  return bestand;
}

/** De rij met velden van deel `index` bij het opsplitsen. */
function deel(index: number) {
  return {
    instrument: screen.getAllByLabelText('pdfTools.instrument')[index],
    nummer: screen.getAllByLabelText('pdfTools.number')[index],
    van: screen.getAllByLabelText('pdfTools.from')[index],
    tot: screen.getAllByLabelText('pdfTools.to')[index],
  };
}

describe('pdf-gereedschap - een pdf inlezen', () => {
  it('toont de gegevens van het bestand en vult de titel alvast in', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });

    await kiesPdf(gebruiker);

    expect(await screen.findByText('Mars_van_de_Vrijheid.pdf')).toBeInTheDocument();
    // Aantal pagina's en de papierformaten die erin voorkomen, zonder dubbele.
    expect(screen.getByText(/4 pdfTools\.pages \| A4, A3/)).toBeInTheDocument();

    // De titel komt uit de bestandsnaam, met streepjes als spaties en zonder
    // extensie - dat scheelt overtypen.
    expect(screen.getByLabelText('pdfTools.musicTitle')).toHaveValue('Mars van de Vrijheid');

    // Eén deel om te beginnen, dat het hele document beslaat.
    expect(deel(0).van).toHaveValue(1);
    expect(deel(0).tot).toHaveValue(4);
  });

  it('meldt het als de pdf niet te lezen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(getPdfInfo).mockRejectedValue(new Error('serverfout'));
    render(<PdfTools />, { wrapper: wikkel });

    await kiesPdf(gebruiker);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('pdfTools.couldNotReadPdf'));
    // En het formulier blijft dicht: er valt niets op te splitsen.
    expect(screen.queryByLabelText('pdfTools.musicTitle')).not.toBeInTheDocument();
  });
});

describe('pdf-gereedschap - de delen samenstellen', () => {
  it('voegt een deel toe dat begint waar het vorige ophoudt', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    // Een getalveld dat zichzelf begrenst laat zich niet leegmaken en opnieuw
    // vullen: zodra het leeg is zet de pagina er weer een 1 in, en wat je
    // daarna typt komt erachter. Dit is dezelfde `change` die de browser
    // stuurt als je de waarde vervangt.
    fireEvent.change(await screen.findByLabelText('pdfTools.to'), { target: { value: '2' } });

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.addPart' }));

    expect(deel(1).van).toHaveValue(3);
    expect(deel(1).tot).toHaveValue(3);
  });

  it('houdt een paginanummer binnen het document', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    const tot = await screen.findByLabelText('pdfTools.to');
    fireEvent.change(tot, { target: { value: '9' } });
    // Het document heeft vier pagina's.
    expect(tot).toHaveValue(4);

    const van = screen.getByLabelText('pdfTools.from');
    fireEvent.change(van, { target: { value: '0' } });
    expect(van).toHaveValue(1);
  });

  it('gooit een deel weg, en laat het laatste deel staan', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));
    expect(screen.getAllByLabelText('pdfTools.from')).toHaveLength(2);

    await gebruiker.click(screen.getAllByTitle('common.delete')[0]);
    expect(screen.getAllByLabelText('pdfTools.from')).toHaveLength(1);

    // Bij één deel valt er niets meer weg te gooien.
    expect(screen.getByTitle('common.delete')).toBeDisabled();
  });

  it('nummert de partijen van een instrument door', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.addPart' }));

    await gebruiker.selectOptions(deel(0).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(1).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(2).instrument, 'Hoorn (F) - sol');

    expect(deel(0).nummer).toHaveValue(1);
    expect(deel(1).nummer).toHaveValue(2);
    expect(deel(2).nummer).toHaveValue(1);
  });

  /**
   * BEWIJS - een instrument verlaten liet een gat in de nummering achter.
   *
   * `updateInstrument` nummerde na een wisseling alleen de volgende rijen van
   * het NIEUWE instrument opnieuw. De rijen van het instrument dat de rij
   * zojuist verliet bleven staan waar ze stonden: drie trompetpartijen waarvan
   * de eerste hoorn wordt, hielden Trompet 2 en Trompet 3 over - er was geen
   * Trompet 1 meer. Dat nummer gaat mee de bestandsnaam in
   * (`Titel_Arrangeur_Trompet_Bb_2_sol`) en komt zo in de bibliotheek terecht.
   *
   * Op de oude code is deze test rood: de tweede rij stond op 2 en de derde op
   * 3. Gecontroleerd door PdfTools.tsx terug te zetten op HEAD en deze test te
   * draaien.
   */
  it('sluit het gat in de nummering als een rij van instrument wisselt', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.addPart' }));

    await gebruiker.selectOptions(deel(0).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(1).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(2).instrument, 'Trompet (Bb) - sol');
    expect(deel(2).nummer).toHaveValue(3);

    // De eerste partij blijkt toch voor hoorn te zijn.
    await gebruiker.selectOptions(deel(0).instrument, 'Hoorn (F) - sol');

    expect(deel(0).nummer).toHaveValue(1);
    expect(deel(1).nummer).toHaveValue(1);
    expect(deel(2).nummer).toHaveValue(2);
  });

  it('hernummert ook nadat een deel is weggegooid', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.addPart' }));
    await gebruiker.selectOptions(deel(0).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(1).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(2).instrument, 'Trompet (Bb) - sol');

    await gebruiker.click(screen.getAllByTitle('common.delete')[0]);

    expect(deel(0).nummer).toHaveValue(1);
    expect(deel(1).nummer).toHaveValue(2);
  });
});

describe('pdf-gereedschap - opsplitsen', () => {
  const SPLITSING = {
    results: [
      { name: 'deel-1', displayName: '', filename: 'deel-1.pdf', filepath: 'map/deel-1.pdf', pageCount: 2 },
      { name: 'deel-2', displayName: '', filename: 'deel-2.pdf', filepath: 'map/deel-2.pdf', pageCount: 2 },
    ],
  };

  /** Kies een pdf, maak er twee delen met instrument van, en splits. */
  async function splitsInTweeDelen(gebruiker: ReturnType<typeof userEvent.setup>) {
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));
    await gebruiker.selectOptions(deel(0).instrument, 'Trompet (Bb) - sol');
    await gebruiker.selectOptions(deel(1).instrument, 'Hoorn (F) - sol');

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.splitPdf' }));
  }

  it('stuurt de bereiken met een opgebouwde bestandsnaam naar de server', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);

    await splitsInTweeDelen(gebruiker);

    await waitFor(() => expect(splitPdf).toHaveBeenCalled());
    const [bestand, bereiken] = vi.mocked(splitPdf).mock.calls[0];
    expect(bestand.name).toBe('Mars_van_de_Vrijheid.pdf');
    // Titel, arrangeur, instrument, stemming, nummer en sleutel, met liggende
    // streepjes ertussen. Zonder arrangeur staat er 'Unknown'.
    expect(bereiken[0].name).toBe('Mars van de Vrijheid_Unknown_Trompet_Bb_1_sol');
    expect(bereiken[1].name).toBe('Mars van de Vrijheid_Unknown_Hoorn_F_1_sol');
  });

  it('toont de gesplitste delen onder een leesbare naam', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);

    await splitsInTweeDelen(gebruiker);

    expect(await screen.findByText('Mars van de Vrijheid - Unknown - Trompet (Bb) 1 [sol]')).toBeInTheDocument();
    expect(screen.getByText('Mars van de Vrijheid - Unknown - Hoorn (F) 1 [sol]')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('pdfTools.pdfSplitSuccess(2)');
  });

  it('meldt een mislukte splitsing', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockRejectedValue(new Error('serverfout'));

    await splitsInTweeDelen(gebruiker);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('pdfTools.splitFailed'));
    expect(screen.queryByText('pdfTools.results')).not.toBeInTheDocument();
  });

  it('toont de fout van een deel dat niet gelukt is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue({
      results: [
        { name: 'deel-1', displayName: '', filename: 'deel-1.pdf', filepath: 'map/deel-1.pdf', pageCount: 2 },
        { name: 'deel-2', displayName: '', error: 'pagina 9 bestaat niet' },
      ],
    });

    await splitsInTweeDelen(gebruiker);

    expect(await screen.findByText(/pagina 9 bestaat niet/)).toBeInTheDocument();
    // Zonder bestandspad valt er niets te downloaden of te bewaren.
    expect(screen.getAllByRole('button', { name: 'pdfTools.download' })).toHaveLength(1);
  });

  it('haalt een deel op via een adres met een kortlopende sleutel', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    await splitsInTweeDelen(gebruiker);

    await gebruiker.click((await screen.findAllByRole('button', { name: 'pdfTools.download' }))[0]);

    await waitFor(() => expect(withDownloadToken).toHaveBeenCalledWith(expect.stringContaining('map/deel-1.pdf')));
    // Het venster gaat meteen open en krijgt daarna pas het adres: anders
    // houdt de pop-upblokkering het tegen.
    expect(vensterOpen).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(geopendVenster.location.href).toBe('https://tutti.test/pdf.pdf?token=kort'));
  });

  it('sluit het venster weer als de sleutel niet op te halen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(withDownloadToken).mockRejectedValue(new Error('verlopen'));
    await splitsInTweeDelen(gebruiker);

    await gebruiker.click((await screen.findAllByRole('button', { name: 'pdfTools.download' }))[0]);

    await waitFor(() => expect(geopendVenster.close).toHaveBeenCalled());
    expect(showError).toHaveBeenCalledWith('common.sessionExpired');
  });

  it('vraagt eerst om een orkest voordat een deel in de bibliotheek gaat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    await splitsInTweeDelen(gebruiker);

    // Zonder orkest staat de knop uit; de titel vertelt waarom.
    const bewaren = (await screen.findAllByRole('button', { name: 'pdfTools.saveAsMusicPiece' }))[0];
    expect(bewaren).toBeDisabled();
    expect(bewaren).toHaveAttribute('title', 'pdfTools.selectOrchestraFirst');
    expect(savePdfAsMusicPiece).not.toHaveBeenCalled();
  });

  it('bewaart een deel als muziekstuk met de ingevulde gegevens', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(savePdfAsMusicPiece).mockResolvedValue({
      success: true,
      id: 'stuk-1',
      title: 'Mars van de Vrijheid',
      instrumentFound: true,
    });
    await splitsInTweeDelen(gebruiker);

    await gebruiker.selectOptions(await screen.findByDisplayValue('pdfTools.selectOrchestra'), 'orkest-1');
    await gebruiker.selectOptions(screen.getByDisplayValue('pdfTools.noList'), 'lijst-1');
    await gebruiker.click(screen.getAllByRole('button', { name: 'pdfTools.saveAsMusicPiece' })[0]);

    await waitFor(() =>
      expect(savePdfAsMusicPiece).toHaveBeenCalledWith('map/deel-1.pdf', 'deel-1.pdf', 'lijst-1', {
        title: 'Mars van de Vrijheid',
        arranger: '',
        instrumentId: 'inst-trompet',
        tuning: 'Bb',
        groupNumber: '1',
        clef: 'sol',
      }),
    );

    expect(showSuccess).toHaveBeenCalledWith('pdfTools.savedAsMusicPiece(Mars van de Vrijheid)');
    // Het deel blijft staan, maar gemerkt als bewaard.
    expect(await screen.findByText('— pdfTools.saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pdfTools.saved' })).toBeDisabled();
  });

  it('meldt de fout van de server bij het bewaren', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(savePdfAsMusicPiece).mockRejectedValue({ response: { data: { error: 'Titel bestaat al' } } });
    await splitsInTweeDelen(gebruiker);

    await gebruiker.selectOptions(await screen.findByDisplayValue('pdfTools.selectOrchestra'), 'orkest-1');
    await gebruiker.click(screen.getAllByRole('button', { name: 'pdfTools.saveAsMusicPiece' })[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Titel bestaat al'));
  });

  it('bewaart alle delen in één keer en telt op hoeveel er goed gingen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(savePdfAsMusicPiece)
      .mockResolvedValueOnce({ success: true, id: 'stuk-1', title: 'Trompet', instrumentFound: true })
      .mockRejectedValueOnce(new Error('serverfout'));
    await splitsInTweeDelen(gebruiker);

    await gebruiker.selectOptions(await screen.findByDisplayValue('pdfTools.selectOrchestra'), 'orkest-1');
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.saveAllAsMusicPieces' }));

    await waitFor(() => expect(savePdfAsMusicPiece).toHaveBeenCalledTimes(2));
    // Het deel dat misging wordt bij naam genoemd, het andere geteld.
    expect(showError).toHaveBeenCalledWith(
      'pdfTools.errorSavingAsMusicPiece: Mars van de Vrijheid - Unknown - Hoorn (F) 1 [sol]',
    );
    expect(showSuccess).toHaveBeenCalledWith('pdfTools.allSavedAsMusicPieces(1)');
    expect(await screen.findByText('— pdfTools.saved')).toBeInTheDocument();
  });

  it('haalt alle delen als één zip op', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(downloadPdfZip).mockResolvedValue(undefined);
    await splitsInTweeDelen(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.downloadAll' }));

    await waitFor(() =>
      expect(downloadPdfZip).toHaveBeenCalledWith(
        ['map/deel-1.pdf', 'map/deel-2.pdf'],
        'Mars_van_de_Vrijheid_parts.zip',
      ),
    );
  });

  it('meldt een mislukte zip', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    vi.mocked(downloadPdfZip).mockRejectedValue(new Error('serverfout'));
    await splitsInTweeDelen(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.downloadAll' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('pdfTools.downloadFailed'));
  });

  it('stuurt geen zip aan als de sessie geen token meer heeft', async () => {
    const gebruiker = userEvent.setup();
    localStorage.clear();
    vi.mocked(splitPdf).mockResolvedValue(SPLITSING);
    await splitsInTweeDelen(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.downloadAll' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('common.sessionExpired'));
    expect(downloadPdfZip).not.toHaveBeenCalled();
  });
});

describe('pdf-gereedschap - A3 naar A4', () => {
  /** Ga naar het A3-tabblad en kies daar een pdf. */
  async function openA3(gebruiker: ReturnType<typeof userEvent.setup>) {
    render(<PdfTools />, { wrapper: wikkel });
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.a3ToA4' }));
    await kiesPdf(gebruiker);
    await screen.findByText('Mars_van_de_Vrijheid.pdf');
  }

  it('merkt elke pagina met zijn papierformaat', async () => {
    const gebruiker = userEvent.setup();
    await openA3(gebruiker);

    expect(screen.getByText('P1: A4')).toBeInTheDocument();
    // Het A3-vel valt op met een andere merkkleur; dat is waar dit tabblad
    // over gaat.
    expect(screen.getByText('P3: A3')).toHaveClass('badge-warning');
    expect(screen.getByText('P1: A4')).toHaveClass('badge-secondary');
  });

  it('deelt de A3-vellen en toont hoeveel er gedeeld zijn', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdfA3).mockResolvedValue({
      filename: 'Mars_A4.pdf',
      filepath: 'map/Mars_A4.pdf',
      splitCount: 1,
      newPageCount: 5,
    });
    await openA3(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.splitA3ToA4' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('pdfTools.a3SplitSuccess(1)'));
    // Beide zinnen staan in dezelfde alinea, gescheiden door een regeleinde.
    expect(screen.getByText(/pdfTools\.a3PagesSplit\(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/pdfTools\.newDocument\(5\)/)).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.downloadResult' }));
    await waitFor(() => expect(withDownloadToken).toHaveBeenCalledWith(expect.stringContaining('map/Mars_A4.pdf')));
  });

  it('zegt het als er geen A3 in zat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdfA3).mockResolvedValue({
      filename: 'Mars_A4.pdf',
      filepath: 'map/Mars_A4.pdf',
      splitCount: 0,
      newPageCount: 4,
    });
    await openA3(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.splitA3ToA4' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('pdfTools.noA3Found'));
  });

  it('meldt een mislukte deling', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(splitPdfA3).mockRejectedValue(new Error('serverfout'));
    await openA3(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.splitA3ToA4' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('pdfTools.a3SplitFailed'));
    expect(screen.queryByText('pdfTools.done')).not.toBeInTheDocument();
  });
});

describe('pdf-gereedschap - samenvoegen', () => {
  /** Ga naar het samenvoegtabblad en kies daar `aantal` bestanden. */
  async function kiesTeVoegenBestanden(gebruiker: ReturnType<typeof userEvent.setup>, namen: string[]) {
    render(<PdfTools />, { wrapper: wikkel });
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.merge' }));
    await gebruiker.upload(
      screen.getByLabelText('pdfTools.pdfFiles'),
      namen.map((naam) => new File(['%PDF-1.4'], naam, { type: 'application/pdf' })),
    );
  }

  it('somt de gekozen bestanden op in de volgorde waarin ze aan elkaar komen', async () => {
    const gebruiker = userEvent.setup();
    await kiesTeVoegenBestanden(gebruiker, ['eerste.pdf', 'tweede.pdf']);

    expect(screen.getByText('pdfTools.filesSelected(2)')).toBeInTheDocument();
    const lijst = screen.getByRole('list');
    expect(
      within(lijst)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['eerste.pdf', 'tweede.pdf']);
  });

  it('voegt pas samen vanaf twee bestanden', async () => {
    const gebruiker = userEvent.setup();
    await kiesTeVoegenBestanden(gebruiker, ['eerste.pdf']);

    expect(screen.getByRole('button', { name: 'pdfTools.mergeFiles' })).toBeDisabled();
    expect(mergePdfs).not.toHaveBeenCalled();
  });

  it('voegt samen en biedt het resultaat aan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(mergePdfs).mockResolvedValue({
      filename: 'samen.pdf',
      filepath: 'map/samen.pdf',
      pageCount: 8,
    });
    await kiesTeVoegenBestanden(gebruiker, ['eerste.pdf', 'tweede.pdf']);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.mergeFiles' }));

    await waitFor(() => expect(mergePdfs).toHaveBeenCalledWith([expect.anything(), expect.anything()]));
    expect(await screen.findByText('pdfTools.mergedDocument(8)')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('pdfTools.mergeSuccess(2)');

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.downloadResult' }));
    await waitFor(() => expect(withDownloadToken).toHaveBeenCalledWith(expect.stringContaining('map/samen.pdf')));
  });

  it('meldt een mislukte samenvoeging', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(mergePdfs).mockRejectedValue(new Error('serverfout'));
    await kiesTeVoegenBestanden(gebruiker, ['eerste.pdf', 'tweede.pdf']);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.mergeFiles' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('pdfTools.mergeFailed'));
    expect(screen.queryByText('pdfTools.done')).not.toBeInTheDocument();
  });

  it('vergeet een eerder resultaat zodra er andere bestanden gekozen worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(mergePdfs).mockResolvedValue({ filename: 'samen.pdf', filepath: 'map/samen.pdf', pageCount: 8 });
    await kiesTeVoegenBestanden(gebruiker, ['eerste.pdf', 'tweede.pdf']);

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.mergeFiles' }));
    expect(await screen.findByText('pdfTools.mergedDocument(8)')).toBeInTheDocument();

    await gebruiker.upload(screen.getByLabelText('pdfTools.pdfFiles'), [
      new File(['%PDF-1.4'], 'derde.pdf', { type: 'application/pdf' }),
    ]);

    expect(screen.queryByText('pdfTools.mergedDocument(8)')).not.toBeInTheDocument();
  });
});
