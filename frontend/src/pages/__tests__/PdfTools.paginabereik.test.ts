/**
 * Het volgende paginabereik bij het opsplitsen van een pdf.
 *
 * Deze berekening zat als twee regels in de component en begrensde alleen de
 * eindpagina op het aantal pagina's, niet de beginpagina. Bij een pdf van vier
 * pagina's met een bereik dat tot 4 loopt, kwam er daardoor een deel bij met
 * "van 5, tot 4" - een omgekeerd bereik dat buiten het document begint.
 *
 * Het viel op doordat een test die op `van = 2` rekende er `5` uit kreeg.
 * updateSplitRange corrigeert het zodra iemand het veld aanraakt, maar wie
 * meteen op opslaan klikt houdt de foute waarde.
 */

import { describe, it, expect } from 'vitest';
import { volgendPaginabereik } from '../PdfTools';

describe('volgend paginabereik', () => {
  it('begint bij pagina 1 als er nog geen bereik is', () => {
    expect(volgendPaginabereik(undefined, 10)).toEqual({ start: 1, end: 1 });
  });

  it('begint na het vorige bereik', () => {
    expect(volgendPaginabereik(3, 10)).toEqual({ start: 4, end: 4 });
  });

  // Dit is het geval dat misging. Zonder de begrenzing op de beginpagina kwam
  // hier { start: 5, end: 4 } uit: een bereik dat begint waar het document al
  // op is, en dat eindigt vóór het begint.
  it('blijft binnen het document als het vorige bereik tot de laatste pagina liep', () => {
    expect(volgendPaginabereik(4, 4)).toEqual({ start: 4, end: 4 });
  });

  it('blijft binnen het document ook als het vorige bereik er al voorbij lag', () => {
    expect(volgendPaginabereik(9, 4)).toEqual({ start: 4, end: 4 });
  });

  // Zolang de pdf nog niet ingelezen is, is het aantal pagina's onbekend. Dan
  // hoort de berekening gewoon door te tellen in plaats van op nul of één te
  // blijven hangen; zodra het document er is, corrigeert de volgende aanroep.
  it('telt gewoon door als het aantal pagina´s nog onbekend is', () => {
    expect(volgendPaginabereik(3, undefined)).toEqual({ start: 4, end: 4 });
    expect(volgendPaginabereik(undefined, undefined)).toEqual({ start: 1, end: 1 });
  });
});
