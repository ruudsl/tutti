/**
 * De formulierstaat van de repetitiepagina.
 *
 * Twee haken zonder api en zonder scherm: ze houden alleen bij wat er in het
 * formulier staat en of het open is. Juist daarom zijn ze goedkoop te toetsen,
 * en juist daarom gaat het hier mis zonder dat iemand het merkt - een venster
 * dat een oude waarde blijft tonen ziet er precies zo uit als een venster dat
 * het niet doet.
 *
 * De vragen die deze tests stellen:
 *
 *   - blijft er na sluiten iets van de vorige invoer hangen?
 *   - overschrijft "nieuw" een lopende bewerking, inclusief het id?
 *   - werkt updateForm veld voor veld, of gooit het de rest weg?
 *   - houden de drie formulieren (repetitie, standaarddag, genereren) elkaar
 *     met rust?
 *   - blijven de stukkenlijst en de indexen kloppen na verwijderen?
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRehearsalForm, useRehearsalPieces, type RehearsalFormData } from '../useRehearsalForm';

/** De waarden zoals het formulier ze bij een nieuwe repetitie hoort te tonen. */
const LEEG: RehearsalFormData = {
  date: '',
  startTime: '19:30',
  endTime: '21:30',
  location: '',
  type: 'regular',
  notes: '',
  orchestraId: '',
};

/** Een bestaande repetitie zoals openEditForm hem krijgt. */
const BESTAANDE = {
  id: 'rep-7',
  date: '2026-09-12',
  startTime: '20:00',
  endTime: '22:00',
  location: 'De Kruisboog',
  type: 'extra' as const,
  notes: 'Alleen koper',
  orchestraId: 'orkest-1',
};

describe('useRehearsalForm - beginstand', () => {
  it('begint dicht, zonder id en met de standaardtijden', () => {
    const { result } = renderHook(() => useRehearsalForm());

    expect(result.current.showForm).toBe(false);
    expect(result.current.editingId).toBeNull();
    expect(result.current.form).toEqual(LEEG);
    expect(result.current.showDefaultForm).toBe(false);
    expect(result.current.showGenerate).toBe(false);
    expect(result.current.genFrom).toBe('');
    expect(result.current.genTo).toBe('');
  });

  it('begint de standaarddag op maandag met dezelfde tijden', () => {
    const { result } = renderHook(() => useRehearsalForm());

    expect(result.current.defaultForm).toEqual({
      dayOfWeek: 1,
      startTime: '19:30',
      endTime: '21:30',
      location: '',
      orchestraId: '',
    });
  });
});

describe('useRehearsalForm - openen, bewerken, sluiten', () => {
  it('opent een leeg formulier zonder id', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.openNewForm());

    expect(result.current.showForm).toBe(true);
    expect(result.current.editingId).toBeNull();
    expect(result.current.form).toEqual(LEEG);
  });

  it('vult het formulier met de bestaande repetitie en onthoudt het id', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.openEditForm(BESTAANDE));

    expect(result.current.showForm).toBe(true);
    expect(result.current.editingId).toBe('rep-7');
    // Het id hoort níét in de formuliergegevens te belanden: dat gaat straks
    // als geheel naar de api, en een onbekend veld is daar een fout.
    expect(result.current.form).toEqual({
      date: '2026-09-12',
      startTime: '20:00',
      endTime: '22:00',
      location: 'De Kruisboog',
      type: 'extra',
      notes: 'Alleen koper',
      orchestraId: 'orkest-1',
    });
    expect(result.current.form).not.toHaveProperty('id');
  });

  it('laat na sluiten niets van de vorige bewerking staan', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.openEditForm(BESTAANDE));
    act(() => result.current.closeForm());

    expect(result.current.showForm).toBe(false);
    expect(result.current.editingId).toBeNull();
    // Zonder deze reset opent het volgende "nieuw" met de locatie en de notitie
    // van de vorige repetitie erin, en dat wordt stilzwijgend opgeslagen.
    expect(result.current.form).toEqual(LEEG);
  });

  it('gooit een lopende bewerking weg als er een nieuwe repetitie wordt begonnen', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.openEditForm(BESTAANDE));
    act(() => result.current.openNewForm());

    // Blijft het id staan, dan overschrijft "opslaan" de bestaande repetitie
    // met de gegevens van de nieuwe.
    expect(result.current.editingId).toBeNull();
    expect(result.current.form).toEqual(LEEG);
  });

  it('kan het formulier ook rechtstreeks tonen en verbergen', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.setShowForm(true));
    expect(result.current.showForm).toBe(true);

    act(() => result.current.setShowForm(false));
    expect(result.current.showForm).toBe(false);
  });
});

describe('useRehearsalForm - velden bijwerken', () => {
  it('werkt één veld bij en laat de rest ongemoeid', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.updateForm({ location: 'Dorpshuis' }));

    expect(result.current.form).toEqual({ ...LEEG, location: 'Dorpshuis' });
  });

  it('stapelt losse wijzigingen op elkaar', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.updateForm({ date: '2026-10-01' }));
    act(() => result.current.updateForm({ type: 'cancelled' }));
    act(() => result.current.updateForm({ notes: 'Vervalt' }));

    expect(result.current.form).toEqual({
      ...LEEG,
      date: '2026-10-01',
      type: 'cancelled',
      notes: 'Vervalt',
    });
  });

  it('kan een veld weer leegmaken', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.updateForm({ location: 'Dorpshuis' }));
    act(() => result.current.updateForm({ location: '' }));

    expect(result.current.form.location).toBe('');
  });
});

describe('useRehearsalForm - de standaarddag staat los van het repetitieformulier', () => {
  it('werkt de standaarddag bij zonder het repetitieformulier te raken', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.updateForm({ location: 'Dorpshuis' }));
    act(() => result.current.updateDefaultForm({ dayOfWeek: 3, location: 'Muziekschool' }));

    expect(result.current.defaultForm.dayOfWeek).toBe(3);
    expect(result.current.defaultForm.location).toBe('Muziekschool');
    // De twee formulieren delen niets: het ene bijwerken mag het andere niet
    // meeslepen.
    expect(result.current.form.location).toBe('Dorpshuis');
  });

  it('zet de standaarddag met resetDefaultForm terug op maandag', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.updateDefaultForm({ dayOfWeek: 6, startTime: '10:00' }));
    act(() => result.current.resetDefaultForm());

    expect(result.current.defaultForm).toEqual({
      dayOfWeek: 1,
      startTime: '19:30',
      endTime: '21:30',
      location: '',
      orchestraId: '',
    });
  });

  it('toont en verbergt het standaarddagvenster', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.setShowDefaultForm(true));
    expect(result.current.showDefaultForm).toBe(true);
    expect(result.current.showForm).toBe(false);
  });
});

describe('useRehearsalForm - de reeks genereren', () => {
  it('houdt de gekozen periode vast', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.setShowGenerate(true));
    act(() => result.current.setGenFrom('2026-09-01'));
    act(() => result.current.setGenTo('2026-12-31'));

    expect(result.current.showGenerate).toBe(true);
    expect(result.current.genFrom).toBe('2026-09-01');
    expect(result.current.genTo).toBe('2026-12-31');
  });

  it('sluit het venster en wist de periode in één keer', () => {
    const { result } = renderHook(() => useRehearsalForm());

    act(() => result.current.setShowGenerate(true));
    act(() => result.current.setGenFrom('2026-09-01'));
    act(() => result.current.setGenTo('2026-12-31'));
    act(() => result.current.resetGenerate());

    // Een achtergebleven periode zou de volgende keer stilzwijgend opnieuw
    // gebruikt worden, met dubbele repetities als gevolg.
    expect(result.current.showGenerate).toBe(false);
    expect(result.current.genFrom).toBe('');
    expect(result.current.genTo).toBe('');
  });
});

describe('useRehearsalPieces', () => {
  it('begint dicht en leeg', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    expect(result.current.editingPieces).toBe(false);
    expect(result.current.pieces).toEqual([]);
  });

  it('neemt de bestaande stukken over bij het openen', () => {
    const { result } = renderHook(() => useRehearsalPieces());
    const bestaand = [
      { title: 'Ouverture 1812', notes: 'vanaf maat 40' },
      { title: 'Finlandia', notes: '' },
    ];

    act(() => result.current.startEditingPieces(bestaand));

    expect(result.current.editingPieces).toBe(true);
    expect(result.current.pieces).toEqual(bestaand);
  });

  it('voegt een leeg stuk achteraan toe', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    act(() => result.current.startEditingPieces([{ title: 'Finlandia', notes: '' }]));
    act(() => result.current.addPiece());

    expect(result.current.pieces).toEqual([
      { title: 'Finlandia', notes: '' },
      { title: '', notes: '' },
    ]);
  });

  it('werkt het stuk op de gegeven plek bij en laat de buren staan', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    act(() =>
      result.current.startEditingPieces([
        { title: 'A', notes: '' },
        { title: 'B', notes: '' },
        { title: 'C', notes: '' },
      ]),
    );
    act(() => result.current.updatePiece(1, { notes: 'tweede keer' }));

    expect(result.current.pieces).toEqual([
      { title: 'A', notes: '' },
      { title: 'B', notes: 'tweede keer' },
      { title: 'C', notes: '' },
    ]);
  });

  it('verwijdert het stuk op de gegeven plek en schuift de rest op', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    act(() =>
      result.current.startEditingPieces([
        { title: 'A', notes: '' },
        { title: 'B', notes: '' },
        { title: 'C', notes: '' },
      ]),
    );
    act(() => result.current.removePiece(1));

    expect(result.current.pieces).toEqual([
      { title: 'A', notes: '' },
      { title: 'C', notes: '' },
    ]);

    // Na het opschuiven wijst index 1 naar C. Wie de index niet opnieuw uitleest
    // bewerkt het verkeerde stuk.
    act(() => result.current.updatePiece(1, { title: 'C2' }));
    expect(result.current.pieces[1].title).toBe('C2');
  });

  it('laat de lijst met rust bij een index die niet bestaat', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    act(() => result.current.startEditingPieces([{ title: 'A', notes: '' }]));
    act(() => result.current.removePiece(5));
    act(() => result.current.updatePiece(5, { title: 'zweeft' }));

    expect(result.current.pieces).toEqual([{ title: 'A', notes: '' }]);
  });

  it('wist de lijst bij het stoppen, zodat een volgende repetitie leeg begint', () => {
    const { result } = renderHook(() => useRehearsalPieces());

    act(() => result.current.startEditingPieces([{ title: 'A', notes: '' }]));
    act(() => result.current.stopEditingPieces());

    expect(result.current.editingPieces).toBe(false);
    expect(result.current.pieces).toEqual([]);
  });
});
