/**
 * Tests voor de functies in src/api.ts die met bestanden werken: uploads via
 * FormData en downloads via een blob.
 *
 * Deze functies zijn niet dun. Ze lezen de kopregel Content-Disposition uit,
 * verzinnen zelf een terugvalnaam en maken een onzichtbaar ankerelement aan om
 * de download te starten. Dat is precies het soort code waar een fout pas
 * opvalt als iemand een bestand met de naam "undefined" in zijn map ziet staan.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver-api';
import {
  uploadMusicPieces,
  uploadMusicPiecesWithProgress,
  batchExportMusicPieces,
  batchExportByTitle,
  downloadMusicPiece,
  downloadProgramPdf,
  downloadBackup,
  restoreBackup,
  uploadLogo,
  uploadTitleMp3,
  getMp3Blob,
  createMp3BlobUrl,
  exportConcertProgram,
  exportBumaStemra,
  exportConcertAttendeesCsv,
  exportTicketSalesCsv,
} from '../api';

/** De ankerelementen die de code aanmaakt om een download te starten. */
let ankers: HTMLAnchorElement[] = [];
let vrijgegeven: string[] = [];

beforeEach(() => {
  startNepserver();
  ankers = [];
  vrijgegeven = [];

  // jsdom kent createObjectURL niet en navigeert niet, dus die twee vervangen
  // we. Zo kunnen we zien welke bestandsnaam de code op het anker zet zonder
  // dat de test op een niet-geïmplementeerde browserfunctie stukloopt.
  window.URL.createObjectURL = vi.fn(() => 'blob:nep/1') as typeof URL.createObjectURL;
  window.URL.revokeObjectURL = vi.fn((url: string) => {
    vrijgegeven.push(url);
  }) as typeof URL.revokeObjectURL;

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    ankers.push(this);
  });
});

afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

/** De bestandsnaam die de laatste download aan de browser meegaf. */
function laatsteBestandsnaam(): string | null {
  const anker = ankers[ankers.length - 1];
  if (!anker) throw new Error('Er is geen download gestart.');
  return anker.getAttribute('download');
}

describe('uploadMusicPieces', () => {
  it('stuurt de bestanden als FormData naar de uploadroute', async () => {
    antwoordMet({ uploaded: [{ id: 'p1' }] });
    const bestanden = [new File(['a'], 'trompet.pdf'), new File(['b'], 'hoorn.pdf')];
    await uploadMusicPieces(bestanden, 'l1', { 'trompet.pdf': 'https://youtu.be/abc' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/upload');
    expect(verzoek.headers['Content-Type']).toBe('multipart/form-data');

    const body = verzoek.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    // Alle bestanden onder dezelfde veldnaam; de backend leest ze als een lijst.
    expect(body.getAll('files')).toHaveLength(2);
    expect(body.get('listId')).toBe('l1');
    expect(body.get('youtubeUrls')).toBe('{"trompet.pdf":"https://youtu.be/abc"}');
  });

  it('laat listId en youtubeUrls weg als ze er niet zijn', async () => {
    antwoordMet({ uploaded: [] });
    await uploadMusicPieces([new File(['a'], 'x.pdf')]);

    const body = laatsteVerzoek().body as FormData;
    expect(body.get('listId')).toBeNull();
    expect(body.get('youtubeUrls')).toBeNull();
  });
});

describe('uploadMusicPiecesWithProgress', () => {
  it('meldt begin en einde van de upload', async () => {
    const begonnen = vi.fn();
    const klaar = vi.fn();
    antwoordMet({ uploaded: [] });

    await uploadMusicPiecesWithProgress([new File(['a'], 'x.pdf')], {
      listId: 'l1',
      onUploadStart: begonnen,
      onUploadComplete: klaar,
    });

    expect(begonnen).toHaveBeenCalledTimes(1);
    expect(klaar).toHaveBeenCalledTimes(1);
    expect(laatsteVerzoek().pad).toBe('/music-pieces/upload');
  });

  // Als de upload misgaat wordt onUploadComplete niet aangeroepen, want die
  // regel staat na de await. Een scherm dat zijn laadbalk daarop afsluit blijft
  // dus hangen bij een fout - vandaar dat dit expliciet vastligt.
  it('meldt géén einde als de upload mislukt', async () => {
    const begonnen = vi.fn();
    const klaar = vi.fn();
    antwoordMetFout(413, { error: 'Bestand te groot' });

    await expect(
      uploadMusicPiecesWithProgress([new File(['a'], 'x.pdf')], {
        onUploadStart: begonnen,
        onUploadComplete: klaar,
      }),
    ).rejects.toMatchObject({ response: { status: 413 } });

    expect(begonnen).toHaveBeenCalledTimes(1);
    expect(klaar).not.toHaveBeenCalled();
  });

  it('rekent de voortgang om naar hele procenten', async () => {
    const voortgang = vi.fn();
    antwoordMet({ uploaded: [] });

    await uploadMusicPiecesWithProgress([new File(['a'], 'x.pdf')], { onProgress: voortgang });

    // De nepadapter verstuurt niets, dus roept ook niets de voortgangsmelder
    // aan. We halen de functie die axios zou aanroepen uit het verzoek en
    // voeren hem zelf uit met de gebeurtenissen die een echte upload geeft.
    const melder = laatsteVerzoek().onUploadProgress;
    if (!melder) throw new Error('Er is geen voortgangsmelder aan axios meegegeven.');

    melder({ loaded: 45, total: 200 } as never);
    // 22,5 procent wordt naar boven afgerond; een laadbalk werkt met hele
    // getallen, en zonder de afronding kwam hier 22.5 in beeld te staan.
    expect(voortgang).toHaveBeenLastCalledWith(23);

    melder({ loaded: 200, total: 200 } as never);
    expect(voortgang).toHaveBeenLastCalledWith(100);
  });

  it('meldt geen voortgang als de totale omvang onbekend is', async () => {
    // Bij een gecomprimeerde verbinding kent de browser total niet. Zonder de
    // controle daarop zou hier Infinity of NaN als percentage uit komen en
    // sprong de laadbalk naar een onzinnige stand.
    const voortgang = vi.fn();
    antwoordMet({ uploaded: [] });

    await uploadMusicPiecesWithProgress([new File(['a'], 'x.pdf')], { onProgress: voortgang });

    const melder = laatsteVerzoek().onUploadProgress;
    if (!melder) throw new Error('Er is geen voortgangsmelder aan axios meegegeven.');

    melder({ loaded: 45, total: undefined } as never);
    expect(voortgang).not.toHaveBeenCalled();
  });
});

describe('downloadMusicPiece', () => {
  it('haalt het stuk als blob op en start een download', async () => {
    antwoordMet(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="Mars-trompet.pdf"' } });
    await downloadMusicPiece('p1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/p1/download');
    expect(verzoek.responseType).toBe('blob');
    expect(laatsteBestandsnaam()).toBe('Mars-trompet.pdf');
    // Het blob-adres hoort weer vrijgegeven te worden, anders lekt er geheugen
    // bij elke download.
    expect(vrijgegeven).toEqual(['blob:nep/1']);
  });

  it('leest ook een bestandsnaam zonder aanhalingstekens', async () => {
    antwoordMet(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename=Mars.pdf' } });
    await downloadMusicPiece('p1');

    expect(laatsteBestandsnaam()).toBe('Mars.pdf');
  });

  it('valt terug op muziekstuk.pdf als de server geen naam meegeeft', async () => {
    antwoordMet(new Blob(['%PDF']));
    await downloadMusicPiece('p1');

    expect(laatsteBestandsnaam()).toBe('muziekstuk.pdf');
  });

  it('laat het anker niet in de pagina achter', async () => {
    antwoordMet(new Blob(['%PDF']));
    await downloadMusicPiece('p1');

    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('batchExportMusicPieces', () => {
  it('stuurt de ids en de keuze over metagegevens mee', async () => {
    antwoordMet(new Blob(['PK']), { headers: { 'Content-Disposition': 'attachment; filename="export.zip"' } });
    await batchExportMusicPieces(['p1', 'p2'], false);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/batch-export');
    expect(verzoek.body).toEqual({ pieceIds: ['p1', 'p2'], includeMetadata: false });
    expect(verzoek.responseType).toBe('blob');
    expect(laatsteBestandsnaam()).toBe('export.zip');
  });

  it('neemt metagegevens standaard mee', async () => {
    antwoordMet(new Blob(['PK']));
    await batchExportMusicPieces(['p1']);

    expect((laatsteVerzoek().body as Record<string, unknown>).includeMetadata).toBe(true);
  });

  it('verzint zelf een naam met de datum erin als de server er geen geeft', async () => {
    vi.setSystemTime(new Date('2026-08-22T10:00:00Z'));
    antwoordMet(new Blob(['PK']));
    await batchExportMusicPieces(['p1']);

    expect(laatsteBestandsnaam()).toBe('muziekstukken-export-2026-08-22.zip');
    vi.useRealTimers();
  });
});

describe('batchExportByTitle', () => {
  it('stuurt titel en arrangeur mee', async () => {
    antwoordMet(new Blob(['PK']), { headers: { 'Content-Disposition': 'attachment; filename="mars.zip"' } });
    await batchExportByTitle('Mars', 'Jan Jansen');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/batch-export-by-title');
    expect(verzoek.body).toEqual({ title: 'Mars', arranger: 'Jan Jansen' });
    expect(laatsteBestandsnaam()).toBe('mars.zip');
  });

  // De terugvalnaam wordt uit de titel gemaakt. Alles wat geen letter of cijfer
  // is wordt een liggend streepje, want een titel als "Sing, Sing, Sing" of
  // "AC/DC" zou anders een onbruikbare bestandsnaam opleveren.
  it('maakt van een titel met leestekens een veilige bestandsnaam', async () => {
    vi.setSystemTime(new Date('2026-08-22T10:00:00Z'));
    antwoordMet(new Blob(['PK']));
    await batchExportByTitle('Sing, Sing, Sing!');

    expect(laatsteBestandsnaam()).toBe('Sing__Sing__Sing_-2026-08-22.zip');
    vi.useRealTimers();
  });

  it('kapt een erg lange titel af op vijftig tekens', async () => {
    vi.setSystemTime(new Date('2026-08-22T10:00:00Z'));
    antwoordMet(new Blob(['PK']));
    await batchExportByTitle('a'.repeat(80));

    expect(laatsteBestandsnaam()).toBe(`${'a'.repeat(50)}-2026-08-22.zip`);
    vi.useRealTimers();
  });
});

describe('downloadProgramPdf en downloadBackup', () => {
  it('downloadProgramPdf geeft de blob terug in plaats van hem op te slaan', async () => {
    antwoordMet(new Blob(['%PDF']));
    const blob = await downloadProgramPdf('l1');

    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/program-pdf');
    expect(laatsteVerzoek().responseType).toBe('blob');
    expect(blob).toBeInstanceOf(Blob);
    // Deze functie start zelf geen download; de aanroeper doet dat.
    expect(ankers).toHaveLength(0);
  });

  it('downloadBackup leest de bestandsnaam uit de kopregel', async () => {
    antwoordMet(new Blob(['PK']), { headers: { 'Content-Disposition': 'attachment; filename="backup-2026.zip"' } });
    await downloadBackup();

    expect(laatsteVerzoek().pad).toBe('/backup');
    expect(laatsteVerzoek().responseType).toBe('blob');
    expect(laatsteBestandsnaam()).toBe('backup-2026.zip');
  });

  // Vastgelegd, niet goedgekeurd: downloadBackup gebruikt een ander patroon dan
  // de exportfuncties hierboven (/filename="(.+)"/ in plaats van het patroon
  // met twee varianten). Een naam zonder aanhalingstekens wordt hier dus niet
  // herkend en de terugvalnaam met de datum wordt gebruikt.
  it('herkent een bestandsnaam zonder aanhalingstekens niet', async () => {
    vi.setSystemTime(new Date('2026-08-22T10:00:00Z'));
    antwoordMet(new Blob(['PK']), { headers: { 'Content-Disposition': 'attachment; filename=backup.zip' } });
    await downloadBackup();

    expect(laatsteBestandsnaam()).toBe('harmonie-backup-2026-08-22.zip');
    vi.useRealTimers();
  });

  it('restoreBackup stuurt het bestand met een ruimere tijdslimiet', async () => {
    antwoordMet({});
    await restoreBackup(new File(['PK'], 'backup.zip'));

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/backup/restore');
    expect((verzoek.body as FormData).get('backup')).toBeInstanceOf(File);
    // Een terugzetactie duurt langer dan de standaard vijftien seconden; zonder
    // deze ruimere limiet breekt de client de herstelactie halverwege af.
    expect(verzoek.timeout).toBe(300000);
  });
});

describe('losse uploads', () => {
  it('uploadLogo stuurt het logo onder de veldnaam logo', async () => {
    antwoordMet({ logoUrl: '/uploads/logo.png' });
    await uploadLogo(new File(['x'], 'logo.png', { type: 'image/png' }));

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/settings/logo');
    expect(verzoek.headers['Content-Type']).toBe('multipart/form-data');
    expect((verzoek.body as FormData).get('logo')).toBeInstanceOf(File);
  });

  it('uploadTitleMp3 stuurt het bestand onder de veldnaam mp3', async () => {
    antwoordMet({ message: 'ok', mp3FilePath: '/uploads/x.mp3' });
    await uploadTitleMp3('t1', new File(['x'], 'x.mp3', { type: 'audio/mpeg' }));

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/title-mp3/t1');
    expect((verzoek.body as FormData).get('mp3')).toBeInstanceOf(File);
  });
});

describe('mp3 als blob', () => {
  it('getMp3Blob haalt het bestand op met de kopregel in plaats van met een token in de url', async () => {
    localStorage.setItem('token', 'jwt-van-de-server');
    antwoordMet(new Blob(['ID3']));
    await getMp3Blob('stuk.mp3');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/mp3/stuk.mp3');
    expect(verzoek.responseType).toBe('blob');
    // Dit is het hele punt van deze functie: het token hoort in de kopregel,
    // niet in de queryreeks waar servers en proxy's hem meeloggen.
    expect(verzoek.headers.Authorization).toBe('Bearer jwt-van-de-server');
    expect(verzoek.queryreeks).toBe('');
    localStorage.clear();
  });

  it('createMp3BlobUrl maakt een blob-adres van het antwoord', async () => {
    antwoordMet(new Blob(['ID3']));

    await expect(createMp3BlobUrl('stuk.mp3')).resolves.toBe('blob:nep/1');
  });
});

describe('tekstexports', () => {
  it('exportConcertProgram vraagt om tekst, niet om JSON', async () => {
    antwoordMet('Mars;Jan Jansen');
    const tekst = await exportConcertProgram('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/concerts/c1/program/export');
    expect(verzoek.responseType).toBe('text');
    expect(tekst).toBe('Mars;Jan Jansen');
  });

  it('exportBumaStemra geeft de periode als queryreeks mee', async () => {
    antwoordMet('regel1');
    await exportBumaStemra({ startDate: '2026-01-01', endDate: '2026-12-31' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/concerts/buma-stemra-export');
    expect(verzoek.query.get('startDate')).toBe('2026-01-01');
    expect(verzoek.responseType).toBe('text');
  });
});

describe('csv-exports', () => {
  // format=csv staat hier in het pad in plaats van in params. Dat werkt, maar
  // het betekent wel dat de route hier verschilt van getConcertAttendees terwijl
  // het dezelfde backendroute is.
  it('exportConcertAttendeesCsv zet format=csv in de queryreeks', async () => {
    antwoordMet(new Blob(['naam;aantal']));
    await exportConcertAttendeesCsv('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/concerts/c1/attendees?format=csv');
    expect(verzoek.query.get('format')).toBe('csv');
    expect(verzoek.responseType).toBe('blob');
    expect(laatsteBestandsnaam()).toBe('attendees-c1.csv');
  });

  it('exportTicketSalesCsv geeft de filters mee en noemt het bestand naar vandaag', async () => {
    vi.setSystemTime(new Date('2026-08-22T10:00:00Z'));
    antwoordMet(new Blob(['bestelling;bedrag']));
    await exportTicketSalesCsv({ concertId: 'c1', status: 'paid' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/tickets/sales/export');
    expect(verzoek.query.get('concertId')).toBe('c1');
    expect(verzoek.query.get('status')).toBe('paid');
    expect(laatsteBestandsnaam()).toBe('ticket-sales-2026-08-22.csv');
    vi.useRealTimers();
  });
});
