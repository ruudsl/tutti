/**
 * De labels van de invallerszoeker horen bij hun veld.
 *
 * In het zoekvenster en in het uitnodigingsvenster stonden label en veld los
 * naast elkaar in dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een
 * schermlezer kondigde een keuzelijst aan zonder te zeggen waarvoor die was, en
 * klikken op het label zette de aanwijzer nergens.
 *
 * Alle vijf de gevallen zijn echte formuliervelden met precies één
 * invoerelement eronder, dus ze lopen sinds de ombouw via `FormField`.
 *
 * `getByLabelText` is hier de kern van de test: die vindt een veld alleen als
 * de koppeling er echt is. Zoeken via de omhullende `.form-group` zou ook op de
 * kapotte code slagen en bewijst niets.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplacementFinder } from '../ReplacementFinder';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Hobo', tuning: null }] }),
}));

vi.mock('../../hooks/useExternalMusicians', () => ({
  useExternalMusicianSearch: () => ({
    data: [
      {
        id: 'mus-1',
        firstName: 'Anna',
        lastName: 'de Groot',
        email: 'anna@example.org',
        musicianType: 'alumni',
        skillLevel: 'advanced',
        rating: 4,
        totalPerformances: 7,
        lastPlayedDate: null,
        isPrimary: false,
      },
    ],
    isLoading: false,
  }),
}));

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutateAsync: async () => ({ id: 'verzoek-1' }), isPending: false }),
}));

vi.mock('../../hooks/useReplacementRequests', () => ({
  useInviteMusician: muteerder,
  useCreateReplacementRequest: muteerder,
}));

/** Toon de zoeker voor een concert, zodat ook het spoedveld verschijnt. */
function toonZoeker() {
  render(
    <ReplacementFinder
      isOpen
      onClose={() => {}}
      eventType="concert"
      eventId="con-1"
      eventDate="2026-09-12"
      eventName="Najaarsconcert"
    />,
  );
  return userEvent.setup();
}

describe('invallerszoeker - labels gekoppeld aan hun veld', () => {
  it('vindt de drie filtervelden op hun labeltekst', () => {
    toonZoeker();

    // Het sterretje achter "instrument" hoort bij de labeltekst, dus zoeken we
    // met een reguliere uitdrukking in plaats van op de hele tekst.
    expect(screen.getByLabelText(/replacementFinder\.instrument/).tagName).toBe('SELECT');
    expect(screen.getByLabelText('replacementFinder.skillLevel').tagName).toBe('SELECT');
    expect(screen.getByLabelText('replacementFinder.urgency')).toHaveValue('normal');
  });

  it('kiest een instrument via het label en toont de gevonden musici', async () => {
    const gebruiker = toonZoeker();

    // Klikken op het label zet de aanwijzer in de keuzelijst: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText(/replacementFinder\.instrument/));
    expect(screen.getByLabelText(/replacementFinder\.instrument/)).toHaveFocus();

    await gebruiker.selectOptions(screen.getByLabelText(/replacementFinder\.instrument/), 'inst-1');
    expect(await screen.findByText('de Groot', { exact: false })).toBeInTheDocument();
  });

  it('vindt ook de velden van het uitnodigingsvenster op hun labeltekst', async () => {
    const gebruiker = toonZoeker();

    await gebruiker.selectOptions(screen.getByLabelText(/replacementFinder\.instrument/), 'inst-1');
    await gebruiker.click(await screen.findByRole('button', { name: /replacementFinder\.invite/ }));

    expect(await screen.findByLabelText('replacementFinder.fee')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('common.notes').tagName).toBe('TEXTAREA');
  });
});
