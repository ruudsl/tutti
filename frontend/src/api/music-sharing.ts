/**
 * Muziek delen tussen verenigingen.
 *
 * De regels staan in docs/PARTNERSCHAPPEN.md. Voor de voorkant komt het hierop
 * neer: koppelen gaat via een code, delen gaat per titel, en een bestand komt
 * pas los na een verzoek dat de eigenaar goedkeurt.
 */

import api from './client';

export interface Partner {
  id: string;
  name: string;
  displayName: string | null;
}

export interface Koppelcode {
  code: string;
  expiresAt: string;
  geldigUren: number;
}

export interface GedeeldeTitel {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  durationSeconds: number | null;
  grade: string | null;
  youtubeUrl: string | null;
  associationId: string;
  associationName: string;
}

export interface CatalogusPartij {
  id: string;
  instrumentName: string | null;
  tuning: string | null;
  groupNumber: string | null;
  request: { status: string; accessExpiresAt: string | null } | null;
}

export interface CatalogusTitel extends Omit<GedeeldeTitel, 'associationId'> {
  parts: CatalogusPartij[];
}

export interface EigenPartij {
  id: string;
  instrumentName: string | null;
  tuning: string | null;
  groupNumber: string | null;
  originalFilename: string;
  uitgesloten: boolean;
}

export interface TitelDeling {
  titleId: string;
  title: string;
  sharedWith: { id: string; name: string; displayName: string | null; sinds: string }[];
  parts: EigenPartij[];
}

export interface Bestandsverzoek {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  message: string | null;
  decisionNote: string | null;
  accessExpiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  pieceId: string;
  originalFilename: string;
  instrumentName: string | null;
  titleName: string | null;
  requestingAssociationName: string;
  ownerAssociationName: string;
  requestedByName: string;
}

export interface Oproep {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  description: string | null;
  referenceUrl: string | null;
  status: 'open' | 'resolved' | 'closed';
  createdAt: string;
  associationId: string;
  associationName: string;
  createdByName: string;
  replyCount: number;
}

export interface OproepAntwoord {
  id: string;
  body: string;
  musicTitleId: string | null;
  createdAt: string;
  associationId: string;
  associationName: string;
  createdByName: string;
}

export interface Overzicht {
  partners: {
    partnerId: string;
    partnerName: string;
    titles: { id: string; title: string; composer: string | null; arranger: string | null; sinds: string }[];
  }[];
  excludedParts: {
    id: string;
    originalFilename: string;
    title: string;
    instrumentName: string | null;
    reason: string | null;
  }[];
}

// Koppelen

export async function maakKoppelcode(): Promise<Koppelcode> {
  const { data } = await api.post('/music-sharing/link-code');
  return data;
}

export async function wisselKoppelcodeIn(code: string): Promise<{ partnerId: string; partnerNaam: string }> {
  const { data } = await api.post('/music-sharing/link-code/redeem', { code });
  return data;
}

export async function haalPartners(): Promise<Partner[]> {
  const { data } = await api.get('/music-sharing/partners');
  return data;
}

export async function beeindigKoppeling(partnerId: string): Promise<void> {
  await api.delete(`/music-sharing/partners/${partnerId}`);
}

// Delen per titel

export async function haalTitelDeling(titleId: string): Promise<TitelDeling> {
  const { data } = await api.get(`/music-sharing/titles/${titleId}`);
  return data;
}

export async function zetTitelDeling(titleId: string, partnerIds: string[]): Promise<void> {
  await api.put(`/music-sharing/titles/${titleId}/shares`, { partnerIds });
}

export async function sluitPartijUit(pieceId: string, reason?: string): Promise<void> {
  await api.post(`/music-sharing/pieces/${pieceId}/exclude`, { reason });
}

export async function deelPartijWeer(pieceId: string): Promise<void> {
  await api.delete(`/music-sharing/pieces/${pieceId}/exclude`);
}

// Catalogus

export async function haalCatalogus(zoekterm?: string): Promise<GedeeldeTitel[]> {
  const { data } = await api.get('/music-sharing/catalog', { params: zoekterm ? { q: zoekterm } : undefined });
  return data;
}

export async function haalCatalogusTitel(titleId: string): Promise<CatalogusTitel> {
  const { data } = await api.get(`/music-sharing/catalog/${titleId}`);
  return data;
}

// Verzoeken

export async function vraagPartijAan(pieceId: string, message?: string): Promise<{ id: string }> {
  const { data } = await api.post('/music-sharing/requests', { pieceId, message });
  return data;
}

export async function haalBinnengekomenVerzoeken(): Promise<Bestandsverzoek[]> {
  const { data } = await api.get('/music-sharing/requests/incoming');
  return data;
}

export async function haalEigenVerzoeken(): Promise<Bestandsverzoek[]> {
  const { data } = await api.get('/music-sharing/requests/outgoing');
  return data;
}

export async function keurVerzoekGoed(id: string, opties: { note?: string; dagen?: number } = {}): Promise<void> {
  await api.post(`/music-sharing/requests/${id}/approve`, opties);
}

export async function wijsVerzoekAf(id: string, note?: string): Promise<void> {
  await api.post(`/music-sharing/requests/${id}/reject`, { note });
}

export async function trekVerzoekIn(id: string): Promise<void> {
  await api.delete(`/music-sharing/requests/${id}`);
}

/**
 * Haalt een vrijgegeven bestand op en biedt het aan om op te slaan.
 *
 * Bewust geen gewone link naar de route: die zou het token niet meesturen en op
 * een 401 eindigen, en het adres van de server staat in VITE_API_URL - op een
 * gesplitste opstelling wijst /api nergens heen. Zelfde aanpak als
 * downloadMusicPiece in api.ts.
 */
export async function haalVrijgegevenBestandOp(verzoekId: string): Promise<void> {
  const antwoord = await api.get(`/music-sharing/requests/${verzoekId}/download`, { responseType: 'blob' });

  let bestandsnaam = 'partij.pdf';
  const kop = antwoord.headers['content-disposition'];
  if (kop) {
    const gevonden = kop.match(/filename="([^"]+)"|filename=([^\s;]+)/);
    if (gevonden) bestandsnaam = gevonden[1] || gevonden[2];
  }

  const url = window.URL.createObjectURL(new Blob([antwoord.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', bestandsnaam);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Oproepen

export async function haalOproepen(status?: string): Promise<Oproep[]> {
  const { data } = await api.get('/music-sharing/wanted', { params: status ? { status } : undefined });
  return data;
}

export interface NieuweOproep {
  title: string;
  composer?: string;
  arranger?: string;
  description?: string;
  referenceUrl?: string;
}

export async function plaatsOproep(oproep: NieuweOproep): Promise<{ id: string }> {
  const { data } = await api.post('/music-sharing/wanted', oproep);
  return data;
}

export async function werkOproepBij(
  id: string,
  wijziging: Partial<NieuweOproep> & { status?: Oproep['status'] },
): Promise<void> {
  await api.patch(`/music-sharing/wanted/${id}`, wijziging);
}

export async function verwijderOproep(id: string): Promise<void> {
  await api.delete(`/music-sharing/wanted/${id}`);
}

export async function haalAntwoorden(oproepId: string): Promise<OproepAntwoord[]> {
  const { data } = await api.get(`/music-sharing/wanted/${oproepId}/replies`);
  return data;
}

export async function antwoordOpOproep(oproepId: string, body: string, musicTitleId?: string): Promise<{ id: string }> {
  const { data } = await api.post(`/music-sharing/wanted/${oproepId}/replies`, { body, musicTitleId });
  return data;
}

// Overzicht

export async function haalOverzicht(): Promise<Overzicht> {
  const { data } = await api.get('/music-sharing/overview');
  return data;
}
