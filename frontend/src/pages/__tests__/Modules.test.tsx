/**
 * De modulepagina moet altijd iets zeggen.
 *
 * De eerste versie liet bij een mislukte API-call alleen de kop en de
 * toelichting staan: geen enkele schakelaar, geen foutmelding, niets wat
 * uitlegde waarom. Dat is niet van een lege lijst te onderscheiden en ziet
 * eruit als een kapotte pagina. Deze tests leggen de drie toestanden vast.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Modules from '../Modules';
import { getModuleSettings } from '../../api/modules';

vi.mock('../../api/modules', () => ({
  getModuleSettings: vi.fn(),
  setModuleEnabled: vi.fn(),
}));

vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({ enabled: [], loading: false, loaded: true, isEnabled: () => false, refresh: vi.fn() }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MODULE = {
  key: 'accounting',
  category: 'finance',
  title: 'Boekhouding',
  description: 'Grootboek, facturen en contributie.',
  enabled: false,
  navPaths: ['/accounting'],
};

const PEILINGEN = {
  key: 'polls',
  category: 'communication',
  title: 'Peilingen',
  description: 'Peilingen onder de leden.',
  enabled: true,
  navPaths: ['/polls'],
};

describe('modulepagina', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toont een schakelaar per module', async () => {
    vi.mocked(getModuleSettings).mockResolvedValue([MODULE]);

    render(<Modules />, { wrapper });

    await waitFor(() => expect(screen.getByText('Boekhouding')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Boekhouding' })).toBeInTheDocument();
  });

  it('zet de schakelaar aan voor een module die aan staat', async () => {
    vi.mocked(getModuleSettings).mockResolvedValue([{ ...MODULE, enabled: true }]);

    render(<Modules />, { wrapper });

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Boekhouding' })).toBeChecked());
  });

  it('meldt het als de lijst niet opgehaald kan worden', async () => {
    vi.mocked(getModuleSettings).mockRejectedValue(new Error('kapot'));

    render(<Modules />, { wrapper });

    // Niet stil een lege pagina, maar een foutmelding met een uitweg.
    await waitFor(() => expect(screen.getByText('modules.errorLoad')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /modules.retry/ })).toBeInTheDocument();
  });

  it('wijst bij een 404 naar de backend, niet naar een storing', async () => {
    // Dit is het geval dat in de praktijk voorkomt: de frontend is bijgewerkt
    // en de backend nog niet. "Het lukte niet" stuurt een beheerder dan de
    // verkeerde kant op.
    vi.mocked(getModuleSettings).mockRejectedValue({ response: { status: 404 } });

    render(<Modules />, { wrapper });

    await waitFor(() => expect(screen.getByText('modules.errorNotDeployed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /modules.retry/ })).toBeInTheDocument();
  });

  it('legt bij een 403 uit dat het beheerderswerk is, zonder knop', async () => {
    vi.mocked(getModuleSettings).mockRejectedValue({ response: { status: 403 } });

    render(<Modules />, { wrapper });

    await waitFor(() => expect(screen.getByText('modules.errorNotAdmin')).toBeInTheDocument());
    // Opnieuw proberen helpt hier niet; die knop hoort er dus niet te staan.
    expect(screen.queryByRole('button', { name: /modules.retry/ })).not.toBeInTheDocument();
  });

  it('meldt het als er geen modules zijn', async () => {
    vi.mocked(getModuleSettings).mockResolvedValue([]);

    render(<Modules />, { wrapper });

    await waitFor(() => expect(screen.getByText('modules.empty')).toBeInTheDocument());
  });

  describe('groepering', () => {
    it('zet elke module onder het kopje van zijn groep', async () => {
      vi.mocked(getModuleSettings).mockResolvedValue([MODULE, PEILINGEN]);

      render(<Modules />, { wrapper });

      await waitFor(() => expect(screen.getByText('Boekhouding')).toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'modules.categories.finance.title' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'modules.categories.communication.title' })).toBeInTheDocument();
    });

    it('toont geen kopje voor een groep zonder modules', async () => {
      vi.mocked(getModuleSettings).mockResolvedValue([MODULE]);

      render(<Modules />, { wrapper });

      await waitFor(() => expect(screen.getByText('Boekhouding')).toBeInTheDocument());
      expect(screen.queryByRole('heading', { name: 'modules.categories.music.title' })).not.toBeInTheDocument();
    });

    it('houdt de kopjes in een vaste volgorde, los van de volgorde uit de backend', async () => {
      // De backend geeft geld eerst; op het scherm hoort communicatie ervoor.
      vi.mocked(getModuleSettings).mockResolvedValue([MODULE, PEILINGEN]);

      render(<Modules />, { wrapper });

      await waitFor(() => expect(screen.getByText('Boekhouding')).toBeInTheDocument());
      const kopjes = screen.getAllByRole('heading', { level: 2 }).map((k) => k.textContent);
      expect(kopjes).toEqual(['modules.categories.communication.title', 'modules.categories.finance.title']);
    });

    it('laat een module met een onbekende groep niet van het scherm vallen', async () => {
      // Een backend die een nieuwe groep kent mag hier geen schakelaar kosten.
      vi.mocked(getModuleSettings).mockResolvedValue([{ ...MODULE, category: 'iets-nieuws' }]);

      render(<Modules />, { wrapper });

      await waitFor(() => expect(screen.getByText('Boekhouding')).toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'modules.categories.other.title' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Boekhouding' })).toBeInTheDocument();
    });
  });
});
