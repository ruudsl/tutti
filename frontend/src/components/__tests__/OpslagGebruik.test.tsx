/**
 * De opslagkaart in het beheergedeelte van het dashboard: gebruik tegenover
 * de grens van de vereniging, als balk en als tekst in de taal van de
 * gebruiker.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import OpslagGebruik from '../OpslagGebruik';
import { getOpslag } from '../../api';
import type { Opslag } from '../../api';

vi.mock('../../api', () => ({ getOpslag: vi.fn() }));

// `t` geeft de sleutel terug, met de waarden erachter als die er zijn.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const ophalen = vi.mocked(getOpslag);

const MB = 1024 * 1024;

function opslag(totaal: number, limiet: number | null): Opslag {
  return {
    gebruik: { bladmuziek: totaal, mp3: 0, musicxml: 0, opnames: 0, wikibijlagen: 0, mailbijlagen: 0, totaal },
    limiet,
  };
}

function toon() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OpslagGebruik />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('de opslagkaart', () => {
  it('toont het gebruik tegenover de grens als balk en als tekst', async () => {
    ophalen.mockResolvedValue(opslag(250 * MB, 1000 * MB));
    toon();

    const balk = await screen.findByRole('progressbar', { name: 'opslag.titel' });
    expect(balk).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByTestId('opslag-tekst')).toHaveTextContent(
      'opslag.gebruiktVanLimiet {"gebruikt":"250 MB","limiet":"1000 MB","procent":25}',
    );
  });

  it('laat de balk niet voorbij de honderd procent lopen als de grens later omlaag ging', async () => {
    ophalen.mockResolvedValue(opslag(1500 * MB, 1000 * MB));
    toon();

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('toont alleen het gebruik als er geen grens is', async () => {
    ophalen.mockResolvedValue(opslag(2 * MB, null));
    toon();

    expect(await screen.findByTestId('opslag-tekst')).toHaveTextContent('opslag.gebruiktOnbeperkt {"gebruikt":"2 MB"}');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('toont niets als de server het gebruik niet geeft', async () => {
    ophalen.mockRejectedValue(new Error('403'));
    const { container } = toon();

    await vi.waitFor(() => expect(ophalen).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('heeft zijn teksten in alle drie de talen, met dezelfde plaatshouders', async () => {
    const talen = await Promise.all([
      import('../../locales/nl.json'),
      import('../../locales/en.json'),
      import('../../locales/de.json'),
    ]);
    for (const taal of talen) {
      const teksten = (taal.default as unknown as { opslag: Record<string, string> }).opslag;
      expect(teksten.titel).toBeTruthy();
      expect(teksten.gebruiktVanLimiet).toContain('{{gebruikt}}');
      expect(teksten.gebruiktVanLimiet).toContain('{{limiet}}');
      expect(teksten.gebruiktOnbeperkt).toContain('{{gebruikt}}');
      expect(teksten.limietBereikt).toBeTruthy();
      const beheer = (taal.default as unknown as { multiAssociation: { subscription: Record<string, string> } })
        .multiAssociation.subscription;
      expect(beheer.maxStorageHint).toBeTruthy();
    }
  });
});
