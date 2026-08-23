/**
 * De labels van de opnamemodule: welke horen bij een veld en welke niet.
 *
 * Dit bestand had vijf `form-label`s zonder koppeling, maar ze waren niet
 * allemaal van dezelfde soort - en dat verschil is precies wat hier wordt
 * vastgelegd.
 *
 * Vier ervan staan boven een echt formulierveld (titel, omschrijving, orkest,
 * muziektitel). Die lopen sinds de ombouw via `FormField` en zijn hieronder met
 * `getByLabelText` te vinden: die zoekmethode vindt een veld alleen als de
 * koppeling er echt is.
 *
 * De vijfde stond boven de geluidsspeler. Een `<audio>` is geen bedienbaar
 * formulierveld en kan dus helemaal geen doel van een `<label>` zijn: de
 * browser koppelt daar niets, terwijl een schermlezer wél "label" aankondigt.
 * Dat opschrift is een `<span>` met dezelfde klasse geworden - het ziet er
 * hetzelfde uit en de lege belofte is weg. De test hieronder bewijst dat er
 * geen `<label>` meer staat waar niets te labelen valt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioRecorder } from '../AudioRecorder';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../hooks/useAudioRecordings', () => ({
  useCreateRecording: () => ({ mutateAsync: async () => ({}), isPending: false }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }] }),
}));

vi.mock('../../hooks/useMusicTitles', () => ({
  useMusicTitles: () => ({ data: [{ id: 'tit-1', title: 'Finlandia' }] }),
}));

/**
 * jsdom kent geen MediaRecorder en geen microfoon. Zonder deze dubbelganger
 * komt het formulier er nooit: de metagegevensvelden verschijnen pas als er een
 * opname ligt.
 */
class OpnemerDubbel {
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  pause() {}
  resume() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['geluid']) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', OpnemerDubbel);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
  });
  URL.createObjectURL = vi.fn(() => 'blob:opname');
  URL.revokeObjectURL = vi.fn();
});

/** Neem iets op en stop weer, zodat het metagegevensformulier verschijnt. */
async function neemOpEnStop() {
  const gebruiker = userEvent.setup();
  render(<AudioRecorder onClose={() => {}} />);
  await gebruiker.click(screen.getByRole('button', { name: /audio\.start/ }));
  await gebruiker.click(await screen.findByRole('button', { name: /audio\.stop/ }));
  return { gebruiker };
}

describe('opnamemodule - labels gekoppeld aan hun veld', () => {
  it('vindt de vier metagegevensvelden op hun labeltekst', async () => {
    await neemOpEnStop();

    // Het sterretje achter "titel" hoort bij de labeltekst.
    expect(await screen.findByLabelText(/common\.title/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('common.description').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('common.orchestra').tagName).toBe('SELECT');
    expect(screen.getByLabelText('music.title').tagName).toBe('SELECT');
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const { gebruiker } = await neemOpEnStop();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(await screen.findByText('common.description'));
    await gebruiker.keyboard('tweede doorloop');

    expect(screen.getByLabelText('common.description')).toHaveValue('tweede doorloop');
  });
});

describe('opnamemodule - het opschrift boven de speler labelt niets', () => {
  it('zet geen <label> boven de geluidsspeler', async () => {
    await neemOpEnStop();

    const opschrift = await screen.findByText('audio.preview');
    // Een <audio> is geen bedienbaar formulierveld, dus hier valt niets te
    // koppelen. Een <label> zou een belofte doen die de browser niet nakomt.
    expect(opschrift.tagName).toBe('SPAN');
    expect(opschrift.closest('label')).toBeNull();
    // Maar het ziet er nog precies hetzelfde uit.
    expect(opschrift).toHaveClass('form-label');
  });

  it('laat in het hele venster geen enkel <label> zonder koppeling achter', async () => {
    await neemOpEnStop();

    // Elk overgebleven <label> wijst met htmlFor naar een veld, of heeft het
    // veld binnenin staan (zo werkt het vinkje "openbaar maken").
    for (const label of Array.from(document.body.querySelectorAll('label'))) {
      const heeftHtmlFor = Boolean(label.getAttribute('for'));
      const omsluitVeld = Boolean(label.querySelector('input, select, textarea'));
      expect(heeftHtmlFor || omsluitVeld).toBe(true);
    }
  });
});
