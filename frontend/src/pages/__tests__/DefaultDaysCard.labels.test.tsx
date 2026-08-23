/**
 * De labels van de vaste repetitiedagen horen bij hun veld.
 *
 * In de kaart "vaste repetitiedagen" stonden label en veld los naast elkaar in
 * dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een schermlezer las
 * daar vijf naamloze velden voor, klikken op een label zette de aanwijzer
 * nergens, en een test kon het veld niet op naam vinden.
 *
 * Alle vijf de velden zijn echte formuliervelden met precies één invoerelement
 * eronder, dus ze lopen sinds de ombouw via `components/FormField`.
 *
 * `getByLabelText` is hier de kern van de test en niet zomaar een zoekmethode:
 * die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook op de kapotte code slagen en bewijst niets.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefaultDaysCard } from '../Rehearsals/DefaultDaysCard';
import type { Orchestra, RehearsalDefaultDay } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const ORKESTEN = [{ id: 'ork-1', name: 'Harmonie' }] as Orchestra[];

/** Toon de kaart met het formulier open, zoals na een klik op "dag toevoegen". */
function toonKaartMetFormulier(overschrijf: Partial<Parameters<typeof DefaultDaysCard>[0]> = {}) {
  const setDefaultForm = vi.fn();
  render(
    <DefaultDaysCard
      showDefaultForm
      setShowDefaultForm={() => {}}
      defaultForm={{ dayOfWeek: 3, startTime: '20:00', endTime: '22:00', location: 'De Zaal', orchestraId: '' }}
      setDefaultForm={setDefaultForm}
      orchestras={ORKESTEN}
      handleAddDefaultDay={() => {}}
      defaultDays={[] as RehearsalDefaultDay[]}
      handleDeleteDefaultDay={() => {}}
      {...overschrijf}
    />,
  );
  return { setDefaultForm };
}

describe('vaste repetitiedagen - labels gekoppeld aan hun veld', () => {
  it('vindt alle vijf de velden op hun labeltekst', () => {
    toonKaartMetFormulier();

    expect(screen.getByLabelText('rehearsals.date').tagName).toBe('SELECT');
    expect(screen.getByLabelText('rehearsals.startTime')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('rehearsals.endTime')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('rehearsals.location')).toHaveValue('De Zaal');
    expect(screen.getByLabelText('rehearsals.orchestra').tagName).toBe('SELECT');
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = userEvent.setup();
    toonKaartMetFormulier();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('rehearsals.location'));
    expect(screen.getByLabelText('rehearsals.location')).toHaveFocus();
  });

  it('geeft elk veld een eigen id, zodat de vijf labels niet naar hetzelfde veld wijzen', () => {
    toonKaartMetFormulier();

    const ids = ['rehearsals.date', 'rehearsals.startTime', 'rehearsals.endTime', 'rehearsals.location'].map(
      (label) => screen.getByLabelText(label).id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
  });
});
