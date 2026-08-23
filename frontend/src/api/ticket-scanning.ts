/**
 * De offline kaartvoorraad voor het scannen aan de deur.
 *
 * Deze twee aanroepen stonden als kale `fetch` in OfflineScanner.tsx, met een
 * eigen token uit localStorage, en gingen zo langs de gedeelde afhandeling van
 * een 401 heen.
 *
 * Ze wezen bovendien naar routes die aan de serverkant niet bestonden, en
 * kwamen dus allebei in de notFoundHandler terecht: de scanner kon zijn
 * voorraad nooit ophalen en zijn wachtrij nooit legen. Ze zijn toen blijven
 * staan omdat de hele offline-modus erop bouwt. Sinds
 * backend/src/routes/tickets.ts bestaan ze wél:
 *
 *   GET  /concerts/:id/tickets/offline-sync
 *   POST /concerts/:id/tickets/sync-offline-scans
 */

import api from './client';

/**
 * Eén kaart uit de vooraf opgehaalde voorraad.
 *
 * De server stuurt bewust niet meer dan dit mee. De voorraad belandt in de
 * browser van een telefoon die de zaal uit gaat en soms geleend is; naam van de
 * koper, e-mailadres, kaartsoort en stoel horen daar niet op te blijven staan
 * als de scanner ze toch nergens toont.
 */
export interface OfflineTicket {
  qrCode: string;
  status: 'valid' | 'used';
  usedAt?: string;
}

export interface OfflineVoorraad {
  concertId: string;
  /** Serverklok: het moment waarop deze lijst is samengesteld. */
  generatedAt: string;
  ticketCount: number;
  tickets: OfflineTicket[];
}

export interface OfflineScanRegel {
  id: string;
  qrCode: string;
  scannedAt: string;
  result: string;
  synced: boolean;
}

/** Een scan die de server niet zomaar kon verwerken; hij wordt gemeld, niet weggegooid. */
export interface OfflineScanWaarschuwing {
  id: string;
  code: string;
  /** 'earlier_scan_kept' | 'offline_scan_kept' | 'refused_offline' | 'not_processed' */
  reason: string;
  /** Het tijdstip van de scan die blijft staan. */
  keptScanAt?: string;
  /** Het tijdstip van de scan die het aflegt. */
  rejectedScanAt?: string;
  message: string;
}

export interface OfflineScanUitslag {
  /** Aantal scans dat nu is verwerkt. */
  processed: number;
  /** Aantal scans dat de server al kende - een tweede inzending verandert niets. */
  skipped: number;
  results: Array<{ id: string; code: string; status: string }>;
  warnings: OfflineScanWaarschuwing[];
}

/** Haalt de kaartvoorraad van een concert op om offline mee te werken. */
export const getOfflineTickets = async (concertId: string): Promise<OfflineVoorraad> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets/offline-sync`);
  return data;
};

/**
 * Stuurt de scans na die offline zijn gemaakt.
 *
 * Dezelfde lijst twee keer aanbieden is veilig: de server herkent elke scan aan
 * zijn id en verwerkt hem maar één keer. Dat is precies wat er gebeurt als het
 * netwerk hapert en de scanner het opnieuw probeert.
 */
export const syncOfflineScans = async (concertId: string, scans: OfflineScanRegel[]): Promise<OfflineScanUitslag> => {
  const { data } = await api.post(`/concerts/${concertId}/tickets/sync-offline-scans`, { scans });
  return data;
};
