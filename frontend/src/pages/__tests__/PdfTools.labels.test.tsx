/**
 * De labels van het pdf-gereedschap horen bij hun veld.
 *
 * Op alle drie de tabbladen - splitsen, A3 naar A4 en samenvoegen - stonden
 * label en veld los naast elkaar in dezelfde `form-group`, zonder `htmlFor` en
 * zonder `id`. Een schermlezer kondigde een bewerkbaar veld aan zonder te
 * zeggen wat erin moest, klikken op het label zette de aanwijzer nergens, en
 * een test kon het veld niet op naam vinden.
 *
 * `getByLabelText` is dus geen willekeurige zoekmethode maar de kern van de
 * test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Alle negen velden lopen sinds de ombouw via `components/FormField`. Zes
 * daarvan staan in de rijen van de splitsing, en dat is precies waarom het een
 * component moet zijn: elke rij krijgt zijn eigen ids uit `useId()`, dus een
 * tweede rij levert geen dubbele koppeling op.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import PdfTools from '../PdfTools';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De voorbeeldweergave tekent de pagina's met pdf.js; die hoort niet bij deze test.
vi.mock('../../components/PdfPagePreview', () => ({ default: () => <div data-testid="pdf-voorbeeld" /> }));

vi.mock('../../api', () => ({ savePdfAsMusicPiece: async () => ({}) }));

vi.mock('../../hooks/useOrchestras', () => ({ useOrchestras: () => ({ data: [] }) }));
vi.mock('../../hooks/useMusicLists', () => ({ useMusicLists: () => ({ data: [] }) }));
vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PDF_INFO = {
  filename: 'partituur.pdf',
  pageCount: 4,
  pages: [1, 2, 3, 4].map((n) => ({
    pageNumber: n,
    width: 595,
    height: 842,
    widthMm: 210,
    heightMm: 297,
    paperSize: 'A4',
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // De pagina stuurt het bestand naar de server om te weten hoeveel pagina's
  // erin zitten; hier antwoordt de server meteen.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => PDF_INFO })),
  );
});

/** Kies een pdf op het geopende tabblad, zodat de rest van het formulier verschijnt. */
async function kiesPdf(gebruiker: ReturnType<typeof userEvent.setup>) {
  const bestand = new File(['%PDF-1.4'], 'partituur.pdf', { type: 'application/pdf' });
  await gebruiker.upload(screen.getByLabelText('pdfTools.pdfFile'), bestand);
}

describe('pdf-gereedschap - labels gekoppeld aan hun veld', () => {
  it('vindt het bestandsveld op elk van de drie tabbladen op zijn labeltekst', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });

    // Splitsen staat open als je binnenkomt.
    expect(screen.getByLabelText('pdfTools.pdfFile')).toHaveAttribute('type', 'file');

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.a3ToA4' }));
    expect(screen.getByLabelText('pdfTools.pdfFile')).toHaveAttribute('type', 'file');

    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.merge' }));
    const meerdere = screen.getByLabelText('pdfTools.pdfFiles');
    expect(meerdere).toHaveAttribute('type', 'file');
    expect(meerdere).toHaveAttribute('multiple');
  });

  it('vindt de velden van een splitsing op hun labeltekst', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    expect(await screen.findByLabelText('pdfTools.musicTitle')).toHaveAttribute(
      'placeholder',
      'pdfTools.musicTitlePlaceholder',
    );
    expect(screen.getByLabelText('pdfTools.arranger')).toHaveAttribute('placeholder', 'pdfTools.arrangerPlaceholder');
    expect(screen.getByLabelText('pdfTools.instrument').tagName).toBe('SELECT');
    expect(screen.getByLabelText('pdfTools.number')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('pdfTools.from')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('pdfTools.to')).toHaveAttribute('type', 'number');
  });

  it('geeft elke rij van de splitsing zijn eigen koppeling', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'pdfTools.addPart' }));

    // Twee rijen, dus twee keer hetzelfde label. Ze horen elk hun eigen veld
    // te wijzen: één gedeelde id zou beide labels op hetzelfde veld laten
    // uitkomen, en dan zou de tweede rij niet te bedienen zijn.
    const vanaf = screen.getAllByLabelText('pdfTools.from');
    expect(vanaf).toHaveLength(2);
    expect(new Set(vanaf.map((v) => v.id)).size).toBe(2);

    // Elk label wijst ook echt naar het veld van zijn eigen rij: de tweede rij
    // begint waar de eerste ophoudt, en dat verschil is hier zichtbaar. Wezen
    // ze naar hetzelfde veld, dan stond er twee keer dezelfde waarde.
    expect(vanaf[0]).toHaveValue(1);
    expect(vanaf[1]).not.toHaveValue(1);

    // Hetzelfde geldt voor de andere velden in de rij.
    expect(new Set(screen.getAllByLabelText('pdfTools.instrument').map((v) => v.id)).size).toBe(2);
    expect(new Set(screen.getAllByLabelText('pdfTools.to').map((v) => v.id)).size).toBe(2);
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await kiesPdf(gebruiker);

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(await screen.findByText('pdfTools.arranger'));
    expect(screen.getByLabelText('pdfTools.arranger')).toHaveFocus();

    await gebruiker.keyboard('Richard Strauss');
    expect(screen.getByLabelText('pdfTools.arranger')).toHaveValue('Richard Strauss');
  });

  it('houdt het bestandsveld van het samenvoegtabblad los van dat van het splitstabblad', async () => {
    const gebruiker = userEvent.setup();
    render(<PdfTools />, { wrapper: wikkel });
    await gebruiker.click(screen.getByRole('button', { name: 'pdfTools.merge' }));

    // Beide tabbladen dragen een bestandsveld; alleen dat van het open tabblad
    // hoort er te staan, anders wijst een label naar een onzichtbaar veld.
    expect(screen.queryByLabelText('pdfTools.pdfFile')).not.toBeInTheDocument();
    expect(within(document.body).getByLabelText('pdfTools.pdfFiles')).toBeInTheDocument();
  });
});
