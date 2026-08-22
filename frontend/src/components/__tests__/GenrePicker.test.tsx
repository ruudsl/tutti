/**
 * Kleuren in het uitklapmenu van de genrekiezer.
 *
 * Het menu hangt aan een portaal buiten het venster en kreeg zijn opmaak
 * volledig in stijlkenmerken mee: `#ffffff` als achtergrond, `#e5e7eb` als
 * rand, `#f3f4f6` bij aanwijzen. Vaste lichte kleuren dus, die in het donkere
 * thema een wit vlak met een lichte rand opleverden. Deze tests leggen vast dat
 * de kleuren uit het thema komen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenrePicker } from '../GenrePicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../hooks/useVocabulary', () => ({
  useGenres: () => ({
    data: {
      genres: [
        { uri: 'genre:mars', label: 'March', labels: { nl: 'Mars', en: 'March', de: 'Marsch' } },
        { uri: 'genre:wals', label: 'Waltz', labels: { nl: 'Wals', en: 'Waltz', de: 'Walzer' } },
      ],
    },
    isLoading: false,
  }),
}));

/** Opent het menu en geeft het uitklapvlak terug. */
async function openMenu() {
  const gebruiker = userEvent.setup();
  render(<GenrePicker value={[]} onChange={vi.fn()} />);
  await gebruiker.click(screen.getByText('metadata.selectGenres'));
  const menu = screen.getByPlaceholderText('metadata.filterGenres').parentElement!.parentElement!;
  return { gebruiker, menu };
}

describe('GenrePicker - kleuren uit het thema', () => {
  it('geeft het uitklapvlak geen vaste witte achtergrond en geen vaste lichte rand', async () => {
    const { menu } = await openMenu();

    expect(menu.style.backgroundColor).toBe('var(--surface)');
    expect(menu.style.border).toBe('1px solid var(--border)');
    expect(menu.getAttribute('style')).not.toMatch(/#ffffff|#fff\b|#e5e7eb/i);
  });

  it('laat geen enkele vaste lichte kleur in de opmaak van het menu staan', async () => {
    const { menu } = await openMenu();

    // Ook de scheidingslijnen, de lijst en het zoekveld erin. jsdom schrijft een
    // hexadecimale kleur om naar rgb(), dus zoeken op `#ffffff` alleen vindt
    // niets; de rgb-vorm van dezelfde kleuren staat er daarom bij.
    const alleStijlen = [menu, ...menu.querySelectorAll<HTMLElement>('[style]')]
      .map((element) => element.getAttribute('style') || '')
      .join(' ');

    expect(alleStijlen).not.toMatch(/#ffffff|#fff\b|#e5e7eb|#f3f4f6|#6b7280|\bwhite\b/i);
    // wit, #e5e7eb, #f3f4f6 en #6b7280 zoals jsdom ze noteert
    expect(alleStijlen).not.toMatch(
      /rgb\(255,\s*255,\s*255\)|rgb\(229,\s*231,\s*235\)|rgb\(243,\s*244,\s*246\)|rgb\(107,\s*114,\s*128\)/,
    );
  });

  it('zet een aangewezen genre na loslaten terug op doorzichtig, niet op wit', async () => {
    const { gebruiker, menu } = await openMenu();

    const regel = screen.getByText('Mars').closest('label')!;
    expect(regel.style.backgroundColor).toBe('transparent');

    await gebruiker.hover(regel);
    expect(regel.style.backgroundColor).toBe('var(--surface-hover)');

    await gebruiker.unhover(regel);
    expect(regel.style.backgroundColor).toBe('transparent');

    // De lijst eronder hoort ook het vlak van het thema te hebben.
    expect(menu.querySelector('ul')!.style.backgroundColor).toBe('var(--surface)');
  });
});
