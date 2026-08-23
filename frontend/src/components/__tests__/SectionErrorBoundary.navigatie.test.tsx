/**
 * Een kapotte pagina bleef de foutmelding tonen op elke volgende pagina.
 *
 * `SectionErrorBoundary` zet `hasError` op waar en had geen enkele weg terug
 * behalve de knop "opnieuw". Bij een routewissel blijft dezelfde instantie
 * staan - React ziet hetzelfde component op dezelfde plek in de boom - dus
 * `hasError` bleef waar en de foutgrens rendeerde zijn melding over de nieuwe
 * pagina heen. Inclusief de foutmelding van de vórige pagina.
 *
 * Dat maakte een fout op een enkele pagina veel groter dan hij was: wie op het
 * logboek een fout kreeg en daarna naar systeemstatus navigeerde, kreeg daar
 * exact dezelfde melding - over een pagina die zelf niets mankeerde. Er is dan
 * geen enkele aanwijzing meer welke pagina de fout veroorzaakte.
 *
 * De grens hoort zichzelf te herstellen zodra het pad wijzigt: een nieuwe
 * pagina verdient een schone kans.
 */

import '@testing-library/jest-dom';
import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  withTranslation: () => (Component: never) => {
    const Verpakt = (props: Record<string, unknown>) => {
      const Comp = Component as unknown as React.ComponentType<Record<string, unknown>>;
      return <Comp {...props} t={(sleutel: string) => sleutel} />;
    };
    return Verpakt;
  },
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

function Stuk(): React.ReactElement {
  throw new Error('deze pagina is stuk');
}

function Heel() {
  return <p>deze pagina werkt prima</p>;
}

function App() {
  return (
    <>
      <Link to="/heel">naar de hele pagina</Link>
      <SectionErrorBoundary sectionName="Page Content">
        <Routes>
          <Route path="/stuk" element={<Stuk />} />
          <Route path="/heel" element={<Heel />} />
        </Routes>
      </SectionErrorBoundary>
    </>
  );
}

describe('foutgrens - herstelt bij een routewissel', () => {
  it('toont de volgende pagina in plaats van de vorige fout', async () => {
    // React logt de gevangen fout; dat hoort erbij en is hier geen signaal.
    const stil = vi.spyOn(console, 'error').mockImplementation(() => {});
    const gebruiker = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/stuk']}>
        <App />
      </MemoryRouter>,
    );

    // De kapotte pagina laat de foutmelding zien - dat is de bedoeling.
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await gebruiker.click(screen.getByText('naar de hele pagina'));

    // Zonder de reparatie staat hier nog steeds de melding van /stuk.
    expect(await screen.findByText('deze pagina werkt prima')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    stil.mockRestore();
  });

  it('blijft de fout tonen zolang het pad niet wijzigt', async () => {
    const stil = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/stuk']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Geen navigatie, dus de melding hoort te blijven staan: anders zou de
    // grens in een lus komen door hetzelfde kapotte kind opnieuw te proberen.
    expect(screen.getByRole('alert')).toBeInTheDocument();

    stil.mockRestore();
  });
});
