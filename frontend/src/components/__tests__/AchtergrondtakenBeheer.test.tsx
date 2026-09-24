/**
 * Het beheerscherm voor achtergrondtaken: opent op de mislukte taken, toont
 * waarom ze mislukten, en heeft alleen bij een mislukte taak een knop om hem
 * opnieuw te proberen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AchtergrondtakenBeheer } from '../AchtergrondtakenBeheer';
import * as api from '../../api';
import type { Achtergrondtaak, AchtergrondtakenPagina } from '../../api';

vi.mock('../../api');

// `t` geeft de sleutel terug, met de waarden erachter als die er zijn.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && !('defaultValue' in opties) ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function taak(extra: Partial<Achtergrondtaak>): Achtergrondtaak {
  return {
    id: 'taak-1',
    soort: 'database-back-up',
    sleutel: null,
    status: 'mislukt',
    pogingen: 3,
    gepland_op: '2026-09-23T10:00:00.000Z',
    eigenaar: null,
    vergrendeld_tot: null,
    laatste_fout: 'Er is geen back-up gemaakt',
    association_id: null,
    aangemaakt_op: '2026-09-23T10:00:00.000Z',
    bijgewerkt_op: '2026-09-23T10:05:00.000Z',
    afgerond_op: '2026-09-23T10:05:00.000Z',
    ...extra,
  };
}

function pagina(taken: Achtergrondtaak[]): AchtergrondtakenPagina {
  return {
    data: taken,
    pagination: { page: 1, limit: 25, total: taken.length, totalPages: 1, hasNext: false, hasPrev: false },
    tellingen: { wachtend: 2, bezig: 0, gelukt: 40, mislukt: 1 },
  };
}

function toon() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AchtergrondtakenBeheer />
    </QueryClientProvider>,
  );
}

describe('het beheerscherm voor achtergrondtaken', () => {
  beforeEach(() => {
    vi.mocked(api.getAchtergrondtaken).mockReset();
    vi.mocked(api.probeerAchtergrondtaakOpnieuw).mockReset();
  });

  it('opent op de mislukte taken', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(pagina([taak({})]));
    toon();

    await screen.findByText('Er is geen back-up gemaakt');
    expect(api.getAchtergrondtaken).toHaveBeenCalledWith(expect.objectContaining({ status: 'mislukt', page: 1 }));
    expect(screen.getByRole('button', { name: /achtergrondtaken\.status\.mislukt/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toont de tellingen per status op de filterknoppen', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(pagina([taak({})]));
    toon();

    // De tellingen komen met de lijst mee; de knoppen staan er al eerder, met nul.
    expect(await screen.findByRole('button', { name: 'achtergrondtaken.status.gelukt (40)' })).toBeInTheDocument();
    const groep = screen.getByRole('group');
    expect(within(groep).getByRole('button', { name: 'achtergrondtaken.status.mislukt (1)' })).toBeInTheDocument();
  });

  it('zet een mislukte taak opnieuw in de wachtrij en haalt de lijst opnieuw op', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(pagina([taak({})]));
    vi.mocked(api.probeerAchtergrondtaakOpnieuw).mockResolvedValue({ id: 'taak-1', status: 'wachtend' });
    toon();

    const knop = await screen.findByRole('button', { name: /achtergrondtaken\.opnieuwVoor/ });
    await userEvent.click(knop);

    expect(api.probeerAchtergrondtaakOpnieuw).toHaveBeenCalledWith('taak-1', expect.anything());
    await vi.waitFor(() => expect(api.getAchtergrondtaken).toHaveBeenCalledTimes(2));
  });

  it('heeft geen knop bij een taak die niet mislukt is', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(
      pagina([taak({ id: 'a', status: 'gelukt', laatste_fout: null }), taak({ id: 'b', status: 'wachtend' })]),
    );
    toon();

    await screen.findAllByText('achtergrondtaken.soorten.database-back-up');
    expect(screen.queryByRole('button', { name: /opnieuwVoor/ })).not.toBeInTheDocument();
  });

  it('vraagt alle taken op als op "alle" wordt geklikt', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(pagina([]));
    toon();

    await userEvent.click(await screen.findByRole('button', { name: 'achtergrondtaken.alle' }));
    await vi.waitFor(() =>
      expect(api.getAchtergrondtaken).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined })),
    );
  });

  it('zegt het als er niets mislukt is', async () => {
    vi.mocked(api.getAchtergrondtaken).mockResolvedValue(pagina([]));
    toon();
    expect(await screen.findByText('achtergrondtaken.geenMetStatus')).toBeInTheDocument();
  });
});
