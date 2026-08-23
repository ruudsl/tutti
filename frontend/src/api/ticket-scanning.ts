/**
 * De offline kaartvoorraad voor het scannen aan de deur.
 *
 * Deze twee aanroepen stonden als kale `fetch` in OfflineScanner.tsx, met een
 * eigen token uit localStorage, en gingen zo langs de gedeelde afhandeling van
 * een 401 heen.
 *
 * LET OP - deze twee routes bestaan aan de serverkant niet. Er is nergens in
 * backend/src een `offline-sync` of een `sync-offline-scans`, onder geen enkel
 * voorvoegsel. Beide aanroepen komen dus in de notFoundHandler terecht.
 *
 * Ze staan hier tóch, en niet weggehaald, omdat de scanner er zijn hele
 * offline-modus op bouwt: zonder vooraf opgehaalde kaarten weet hij bij een
 * wegvallend netwerk niemand meer te herkennen. Het weghalen zou die functie
 * stilzwijgend schrappen; zo blijft zichtbaar wat de server nog moet leveren.
 * De aanroeper toont bij een mislukking een foutmelding, dus het faalt nu
 * hoorbaar in plaats van in stilte.
 */

import api from './client';

export interface OfflineTicket {
  qrCode: string;
  buyerName: string;
  ticketType: string;
  status: 'valid' | 'used';
  seatInfo?: string;
  usedAt?: string;
}

export interface OfflineScanRegel {
  id: string;
  qrCode: string;
  scannedAt: string;
  result: string;
  synced: boolean;
}

/** Haalt de kaartvoorraad van een concert op om offline mee te werken. */
export const getOfflineTickets = async (concertId: string): Promise<{ tickets: OfflineTicket[] }> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets/offline-sync`);
  return data;
};

/** Stuurt de scans na die offline zijn gemaakt. */
export const syncOfflineScans = async (concertId: string, scans: OfflineScanRegel[]): Promise<void> => {
  await api.post(`/concerts/${concertId}/tickets/sync-offline-scans`, { scans });
};
