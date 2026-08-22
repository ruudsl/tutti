/**
 * Tests voor de titel van het browsertabblad.
 *
 * De vertaling wordt gemockt, zodat we kunnen zien dat de hook de vertaalde
 * tekst neerzet en niet de sleutel, en dat hij meegaat wanneer de gebruiker van
 * taal wisselt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const woordenboek: Record<string, Record<string, string>> = {
  nl: { 'pages.music': 'Muziek', 'pages.rehearsals': 'Repetities' },
  en: { 'pages.music': 'Sheet music', 'pages.rehearsals': 'Rehearsals' },
};

let taal = 'nl';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => woordenboek[taal]?.[key] ?? key,
    i18n: { language: taal },
  }),
}));

import { useDocumentTitle } from '../useDocumentTitle';

beforeEach(() => {
  taal = 'nl';
  document.title = '';
});

describe('useDocumentTitle', () => {
  it('zet de vertaalde titel in het tabblad', () => {
    renderHook(() => useDocumentTitle('pages.music'));

    expect(document.title).toBe('Muziek');
  });

  it('gaat mee wanneer het scherm een andere titel krijgt', () => {
    const { rerender } = renderHook(({ sleutel }) => useDocumentTitle(sleutel), {
      initialProps: { sleutel: 'pages.music' },
    });
    expect(document.title).toBe('Muziek');

    rerender({ sleutel: 'pages.rehearsals' });

    expect(document.title).toBe('Repetities');
  });

  it('gaat mee wanneer de gebruiker van taal wisselt', () => {
    const { rerender } = renderHook(() => useDocumentTitle('pages.music'));
    expect(document.title).toBe('Muziek');

    taal = 'en';
    rerender();

    expect(document.title).toBe('Sheet music');
  });

  it('valt terug op de sleutel wanneer er geen vertaling is', () => {
    renderHook(() => useDocumentTitle('pages.onbekend'));

    expect(document.title).toBe('pages.onbekend');
  });

  it('laat de titel staan zoals hij is nadat het scherm weg is', () => {
    const { unmount } = renderHook(() => useDocumentTitle('pages.music'));

    unmount();

    expect(document.title).toBe('Muziek');
  });
});
