/**
 * De mp3-speler zet een download-token voor dat ene bestand in het adres,
 * nooit het sessietoken.
 *
 * <audio src> kan geen Authorization-kopregel meesturen. Het adres droeg
 * daarom het sessietoken in `?token=`, en een adres belandt in logboeken,
 * browsergeschiedenis en Referer-kopregels.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { startNepserver, stopNepserver, antwoordMet, laatsteVerzoek } from '../../__tests__/nepserver-api';
import { Mp3Speler } from '../Mp3Speler';

const SESSIETOKEN = 'sessie-jwt-van-het-lid';

beforeEach(() => {
  startNepserver();
  localStorage.setItem('token', SESSIETOKEN);
});

afterEach(() => {
  stopNepserver();
  vi.useRealTimers();
  localStorage.clear();
});

const speler = (container: HTMLElement) => container.querySelector('audio')!;

describe('Mp3Speler', () => {
  it('speelt af met een download-token voor dit bestand, zonder het sessietoken in het adres', async () => {
    antwoordMet({ token: 'kort-token-voor-mars', expiresIn: 300 });

    const { container } = render(<Mp3Speler bestand="mars.mp3" />);

    await waitFor(() => expect(speler(container)).toHaveAttribute('src'));
    const adres = speler(container).getAttribute('src')!;
    expect(adres).toBe('/api/music-pieces/mp3/mars.mp3?token=kort-token-voor-mars');
    expect(adres).not.toContain(SESSIETOKEN);
    expect(laatsteVerzoek().body).toEqual({ soort: 'mp3', id: 'mars.mp3' });
  });

  it('haalt na het verlopen van het token een vers adres op als het laden mislukt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    antwoordMet({ token: 'eerste', expiresIn: 300 });
    const { container } = render(<Mp3Speler bestand="mars.mp3" />);
    await waitFor(() => expect(speler(container).getAttribute('src')).toContain('token=eerste'));

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    antwoordMet({ token: 'tweede', expiresIn: 300 });
    fireEvent.error(speler(container));

    await waitFor(() => expect(speler(container).getAttribute('src')).toContain('token=tweede'));
  });

  it('haalt niet steeds opnieuw op bij een fout die niets met het token te maken heeft', async () => {
    antwoordMet({ token: 'eerste', expiresIn: 300 });
    const { container } = render(<Mp3Speler bestand="mars.mp3" />);
    await waitFor(() => expect(speler(container).getAttribute('src')).toContain('token=eerste'));

    fireEvent.error(speler(container));

    expect(speler(container).getAttribute('src')).toContain('token=eerste');
  });
});
