/**
 * De beheerschermen voor genres en instrumenten tonen de standaardlijst en de
 * eigen items van de vereniging door elkaar, met het verschil erbij.
 *
 * - Een standaarditem kan de vereniging verbergen en weer tonen, niet
 *   bewerken of verwijderen: dat raakt alle verenigingen, en de server
 *   weigert het dan ook (403). Alleen de superbeheerder krijgt die knoppen.
 * - Een eigen item heeft geen verbergknop; bewerken en (beheerder)
 *   verwijderen wel.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import Genres from '../Genres';
import Instrumenten from '../Instrumenten';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'geb-1', role: 'admin' } }),
}));

const { zetGenre, zetInstrument, superbeheerder, muteerder } = vi.hoisted(() => ({
  zetGenre: vi.fn(async () => {}),
  zetInstrument: vi.fn(async () => {}),
  superbeheerder: { waarde: false },
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useMultiAssociation', () => ({
  useIsSuperAdmin: () => ({ data: superbeheerder.waarde }),
}));

vi.mock('../../hooks/useGenres', () => ({
  useGenres: () => ({
    data: [
      { id: 'g-mars', name: 'Mars', standaard: true, verborgen: false },
      { id: 'g-schlager', name: 'Schlager', standaard: true, verborgen: true },
      { id: 'g-carnaval', name: 'Carnaval', standaard: false, verborgen: false },
    ],
    isLoading: false,
  }),
  useCreateGenre: muteerder,
  useUpdateGenre: muteerder,
  useDeleteGenre: muteerder,
  useZetGenreVerborgen: () => ({ mutateAsync: zetGenre, isPending: false }),
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: [
      { id: 'i-tuba', name: 'Tuba', tuning: 'Bb', clef: 'fa', standaard: true, verborgen: false, aliases: [] },
      { id: 'i-alp', name: 'Alpenhoorn', tuning: 'F', clef: 'sol', standaard: false, verborgen: false, aliases: [] },
    ],
    isLoading: false,
  }),
  useCreateInstrument: muteerder,
  useUpdateInstrument: muteerder,
  useDeleteInstrument: muteerder,
  useZetInstrumentVerborgen: () => ({ mutateAsync: zetInstrument, isPending: false }),
}));

function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

const knop = (naam: string) => screen.queryByRole('button', { name: naam });

beforeEach(() => {
  superbeheerder.waarde = false;
  zetGenre.mockClear();
  zetInstrument.mockClear();
});

describe('genrebeheer', () => {
  it('laat een standaardgenre verbergen, niet bewerken of verwijderen', async () => {
    const gebruiker = toon(<Genres />);

    expect(knop('common.edit: Mars')).not.toBeInTheDocument();
    expect(knop('common.delete: Mars')).not.toBeInTheDocument();
    await gebruiker.click(knop('catalogus.verbergen: Mars')!);
    expect(zetGenre).toHaveBeenCalledWith({ id: 'g-mars', verborgen: true });
  });

  it('laat een verborgen standaardgenre weer tonen', async () => {
    const gebruiker = toon(<Genres />);

    await gebruiker.click(knop('catalogus.tonen: Schlager')!);
    expect(zetGenre).toHaveBeenCalledWith({ id: 'g-schlager', verborgen: false });
  });

  it('laat een eigen genre bewerken en verwijderen, zonder verbergknop', () => {
    toon(<Genres />);

    expect(knop('common.edit: Carnaval')).toBeInTheDocument();
    expect(knop('common.delete: Carnaval')).toBeInTheDocument();
    expect(knop('catalogus.verbergen: Carnaval')).not.toBeInTheDocument();
  });

  it('geeft de superbeheerder ook bewerken en verwijderen van een standaardgenre', () => {
    superbeheerder.waarde = true;
    toon(<Genres />);

    expect(knop('common.edit: Mars')).toBeInTheDocument();
    expect(knop('common.delete: Mars')).toBeInTheDocument();
  });
});

describe('instrumentbeheer', () => {
  it('laat een standaardinstrument verbergen, niet bewerken of verwijderen', async () => {
    const gebruiker = toon(<Instrumenten />);

    expect(knop('common.edit: Tuba')).not.toBeInTheDocument();
    expect(knop('common.delete: Tuba')).not.toBeInTheDocument();
    await gebruiker.click(knop('catalogus.verbergen: Tuba')!);
    expect(zetInstrument).toHaveBeenCalledWith({ id: 'i-tuba', verborgen: true });
  });

  it('laat een eigen instrument bewerken en verwijderen, zonder verbergknop', () => {
    toon(<Instrumenten />);

    expect(knop('common.edit: Alpenhoorn')).toBeInTheDocument();
    expect(knop('common.delete: Alpenhoorn')).toBeInTheDocument();
    expect(knop('catalogus.verbergen: Alpenhoorn')).not.toBeInTheDocument();
  });

  it('toont bij elk instrument of het standaard of eigen is', () => {
    toon(<Instrumenten />);

    expect(screen.getAllByText('catalogus.standaard')).toHaveLength(1);
    expect(screen.getAllByText('catalogus.eigen')).toHaveLength(1);
  });
});
