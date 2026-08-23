/**
 * Het pdf-gereedschap: een document inlezen, opsplitsen, een A3-vel in tweeën
 * delen, losse bestanden samenvoegen, en het resultaat als zip ophalen.
 *
 * Deze vijf aanroepen stonden als kale `fetch` in PdfTools.tsx, elk met een
 * eigen regel die de token uit localStorage plukte. Dat ging langs `client.ts`
 * heen, en daarmee langs de afhandeling van een 401: wie hier met een verlopen
 * sessie een pdf uploadde, kreeg "kon de pdf niet lezen" te zien in plaats van
 * het inlogscherm - een foutmelding die naar het verkeerde probleem wijst.
 *
 * De aanroepers vertalen een mislukking zelf naar een Nederlandse melding,
 * dus deze functies laten de fout gewoon door.
 */

import api from './client';

export interface PdfPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  paperSize: string;
  isLandscape: boolean;
}

export interface PdfInfo {
  pageCount: number;
  pages: PdfPageInfo[];
  filename: string;
}

export interface PdfSplitDeel {
  name: string;
  displayName: string;
  filename?: string;
  filepath?: string;
  pageCount?: number;
  error?: string;
  saved?: boolean;
  title?: string;
  arranger?: string;
  instrumentId?: string;
  tuning?: string;
  groupNumber?: string;
  clef?: string;
}

export interface PdfSplitResultaat {
  results: PdfSplitDeel[];
}

export interface PdfA3Resultaat {
  filename: string;
  filepath: string;
  splitCount: number;
  newPageCount: number;
}

export interface PdfMergeResultaat {
  filename: string;
  filepath: string;
  pageCount: number;
}

/** Een paginabereik zoals de splitsroute het verwacht. */
export interface PdfPaginabereik {
  start: number;
  end: number;
  name: string;
}

/** Aantal pagina's en afmetingen, zonder het bestand te bewaren. */
export const getPdfInfo = async (bestand: File): Promise<PdfInfo> => {
  const formData = new FormData();
  formData.append('pdf', bestand);
  const { data } = await api.post('/pdf-tools/info', formData);
  return data;
};

/** Splitst het document in delen volgens de opgegeven paginabereiken. */
export const splitPdf = async (bestand: File, bereiken: PdfPaginabereik[]): Promise<PdfSplitResultaat> => {
  const formData = new FormData();
  formData.append('pdf', bestand);
  formData.append('ranges', JSON.stringify(bereiken));
  const { data } = await api.post('/pdf-tools/split', formData);
  return data;
};

/** Deelt liggende A3-vellen in twee A4-pagina's. */
export const splitPdfA3 = async (bestand: File): Promise<PdfA3Resultaat> => {
  const formData = new FormData();
  formData.append('pdf', bestand);
  const { data } = await api.post('/pdf-tools/split-a3', formData);
  return data;
};

/** Voegt meerdere pdf's samen tot één document. */
export const mergePdfs = async (bestanden: File[]): Promise<PdfMergeResultaat> => {
  const formData = new FormData();
  bestanden.forEach((bestand) => formData.append('pdfs', bestand));
  const { data } = await api.post('/pdf-tools/merge', formData);
  return data;
};

/**
 * Haalt een aantal eerder gemaakte delen op als één zip.
 *
 * De naam van het zipbestand bepaalt de aanroeper - de server stuurt hier geen
 * Content-Disposition mee die iets zinnigs zegt.
 */
export const downloadPdfZip = async (filepaths: string[], bestandsnaam: string): Promise<void> => {
  const response = await api.post('/pdf-tools/download-zip', { filepaths }, { responseType: 'blob' });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', bestandsnaam);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
