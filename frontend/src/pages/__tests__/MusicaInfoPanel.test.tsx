/**
 * Kleuren in het MusicaInfo-blok van het bewerkvenster.
 *
 * Twee plekken stonden hier op een vaste witte kleur: de balk die oplicht als
 * je een zoekresultaat aanwijst, en het vlak van de gevonden gegevens. In het
 * donkere thema gaf dat een licht vlak met lichte tekst erop.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MusicaInfoPanel } from '../MusicTitles/MusicaInfoPanel';
import type { MusicaInfoDetail, MusicaInfoSearchResult } from '../../api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const resultaat: MusicaInfoSearchResult = {
  articleNumber: '12345',
  title: 'Also sprach Zarathustra',
  composer: 'Richard Strauss',
  arranger: '',
  detailUrl: 'https://example.test/12345',
  publisher: 'De Haske',
  duration: '9:30',
  difficulty: '5',
};

const gegevens: MusicaInfoDetail = {
  articleNumber: '12345',
  title: 'Also sprach Zarathustra',
  composer: 'Richard Strauss',
  arranger: '',
  publisher: 'De Haske',
  duration: '9:30',
  durationSeconds: 570,
  difficulty: '5',
  instrumentation: 'Harmonie',
};

function toon(overschrijving: Partial<React.ComponentProps<typeof MusicaInfoPanel>> = {}) {
  return render(
    <MusicaInfoPanel
      musicaInfoSearching={false}
      musicaInfoResults={null}
      musicaInfoSearchUrl=""
      musicaInfoError=""
      musicaInfoLoadingDetail={null}
      musicaInfoDetail={null}
      onSearch={vi.fn()}
      onLoadDetail={vi.fn()}
      onApply={vi.fn()}
      onReset={vi.fn()}
      {...overschrijving}
    />,
  );
}

describe('MusicaInfoPanel - kleuren uit het thema', () => {
  it('licht een aangewezen zoekresultaat op met het vlak uit het thema', async () => {
    const gebruiker = userEvent.setup();
    toon({ musicaInfoResults: [resultaat] });

    const rij = screen.getByText('Also sprach Zarathustra').parentElement!.parentElement!;

    await gebruiker.hover(rij);
    expect(rij.style.background).toBe('var(--surface-hover)');

    await gebruiker.unhover(rij);
    expect(rij.style.background).toBe('transparent');
  });

  it('geeft het vlak met de gevonden gegevens geen vaste witte achtergrond', () => {
    toon({ musicaInfoDetail: gegevens });

    const vlak = screen.getByText('Also sprach Zarathustra').parentElement!;
    expect(vlak.style.background).toBe('var(--surface)');
    expect(vlak.getAttribute('style')).not.toMatch(/white|#fff/i);
  });
});
