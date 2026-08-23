/**
 * De rondleiding zoals een nieuw lid hem doorloopt.
 *
 * OnboardingTour.test.tsx ernaast leest de bron en de vertalingen; dat vangt of
 * de modulestap er staat, maar niet of iemand er ooit doorheen komt. Hier wordt
 * de rondleiding echt getekend en doorgeklikt: verschijnt hij bij een nieuw
 * lid, blijft hij weg bij iemand die hem al gehad heeft, kun je terug, en wordt
 * "ik heb hem gehad" ook echt onthouden.
 *
 * Dat laatste is het punt waar het misgaat als het misgaat: wordt het niet
 * opgeslagen, dan krijgt een lid bij elke aanmelding opnieuw hetzelfde venster
 * over zijn scherm.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { aanmelding, router } = vi.hoisted(() => ({
  aanmelding: { user: null as { id: string; role: string } | null },
  router: { navigeer: vi.fn() },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: aanmelding.user }),
}));

vi.mock('react-router-dom', async (echt) => {
  const module = await echt<typeof import('react-router-dom')>();
  return { ...module, useNavigate: () => router.navigeer };
});

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
    }),
  };
});

import { OnboardingTour, hasCompletedOnboarding, resetOnboarding } from '../OnboardingTour';

function toon(props: { forceShow?: boolean; onClose?: () => void } = {}) {
  return render(
    <MemoryRouter>
      <OnboardingTour {...props} />
    </MemoryRouter>,
  );
}

/** De teller rechtsonder, bijvoorbeeld "2 / 7". */
function teller(): string {
  return document.querySelector('.onboarding-step-count')?.textContent ?? '';
}

/** Het aantal stippen boven in het venster. */
function stippen(): number {
  return document.querySelectorAll('.onboarding-dot').length;
}

/** Klikt door tot en met de laatste stap. */
async function loopHelemaalDoor(gebruiker: ReturnType<typeof userEvent.setup>) {
  const totaal = stippen();
  for (let stap = 0; stap < totaal; stap += 1) {
    const laatste = stap === totaal - 1;
    await gebruiker.click(screen.getByRole('button', { name: laatste ? 'Voltooien' : 'Volgende' }));
  }
}

beforeEach(() => {
  localStorage.clear();
  router.navigeer.mockReset();
  aanmelding.user = { id: 'lid-1', role: 'member' };
});

describe('wanneer de rondleiding verschijnt', () => {
  it('verschijnt bij een lid dat hem nog niet gehad heeft', () => {
    toon();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Welkom bij de app!')).toBeInTheDocument();
  });

  it('blijft weg bij een lid dat hem al gehad heeft', () => {
    localStorage.setItem('onboarding_completed_lid-1', 'true');

    toon();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blijft weg zolang er niemand is aangemeld', () => {
    aanmelding.user = null;

    toon();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('houdt per lid bij wie hem gehad heeft', () => {
    // Twee leden op dezelfde computer: dat de een hem gehad heeft zegt niets
    // over de ander.
    localStorage.setItem('onboarding_completed_lid-1', 'true');
    aanmelding.user = { id: 'lid-2', role: 'member' };

    toon();

    expect(screen.getByText('Welkom bij de app!')).toBeInTheDocument();
  });

  it('is opnieuw op te vragen, ook door een lid dat hem gehad heeft', () => {
    localStorage.setItem('onboarding_completed_lid-1', 'true');

    toon({ forceShow: true });

    expect(screen.getByText('Welkom bij de app!')).toBeInTheDocument();
  });
});

describe('het welkomvenster', () => {
  it('biedt de keuze tussen starten en overslaan', () => {
    toon();

    expect(screen.getByRole('button', { name: 'Start rondleiding' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sla over' })).toBeInTheDocument();
  });

  it('begint bij de eerste stap na starten', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));

    expect(teller()).toBe('1 / 6');
    expect(screen.queryByText('Welkom bij de app!')).not.toBeInTheDocument();
  });

  it('onthoudt het overslaan, zodat het venster niet elke keer terugkomt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Sla over' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasCompletedOnboarding('lid-1')).toBe(true);
  });

  it('meldt het overslaan aan het scherm eromheen', async () => {
    const gebruiker = userEvent.setup();
    const sluiten = vi.fn();
    toon({ onClose: sluiten });

    await gebruiker.click(screen.getByRole('button', { name: 'Sla over' }));

    expect(sluiten).toHaveBeenCalledTimes(1);
  });
});

describe('door de stappen lopen', () => {
  async function gestart() {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));
    return gebruiker;
  }

  it('telt vooruit bij Volgende', async () => {
    const gebruiker = await gestart();

    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    expect(teller()).toBe('2 / 6');
  });

  it('biedt geen Vorige op de eerste stap', async () => {
    await gestart();

    expect(screen.queryByRole('button', { name: 'Vorige' })).not.toBeInTheDocument();
  });

  it('gaat met Vorige weer terug', async () => {
    const gebruiker = await gestart();
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    await gebruiker.click(screen.getByRole('button', { name: 'Vorige' }));

    expect(teller()).toBe('1 / 6');
    expect(screen.queryByRole('button', { name: 'Vorige' })).not.toBeInTheDocument();
  });

  it('noemt de laatste knop Voltooien in plaats van Volgende', async () => {
    const gebruiker = await gestart();
    for (let stap = 0; stap < 5; stap += 1) {
      await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));
    }

    expect(teller()).toBe('6 / 6');
    expect(screen.getByRole('button', { name: 'Voltooien' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volgende' })).not.toBeInTheDocument();
  });

  it('onthoudt de rondleiding als voltooid en sluit hem af', async () => {
    const gebruiker = await gestart();

    await loopHelemaalDoor(gebruiker);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasCompletedOnboarding('lid-1')).toBe(true);
  });

  it('markeert de stippen als gedaan, bezig en nog te gaan', async () => {
    const gebruiker = await gestart();
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    const alle = [...document.querySelectorAll('.onboarding-dot')];
    expect(alle[0]).toHaveClass('completed');
    expect(alle[1]).toHaveClass('active');
    expect(alle[2]).not.toHaveClass('active');
  });

  it('is met het kruisje af te sluiten, en komt dan niet terug', async () => {
    const gebruiker = await gestart();

    await gebruiker.click(screen.getByRole('button', { name: 'Sluiten' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasCompletedOnboarding('lid-1')).toBe(true);
  });
});

describe('meelopen naar het scherm dat de stap uitlegt', () => {
  it('biedt de knop aan bij een stap die een scherm aanwijst', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));

    // De eerste stap is een welkom zonder scherm, de tweede wijst er wel een aan.
    expect(screen.queryByRole('button', { name: /Ga naar deze pagina/ })).not.toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByRole('button', { name: /Ga naar deze pagina/ })).toBeInTheDocument();
  });

  it('gaat naar het scherm dat bij de stap hoort', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    await gebruiker.click(screen.getByRole('button', { name: /Ga naar deze pagina/ }));

    expect(router.navigeer).toHaveBeenCalledWith('/my-music');
  });

  it('laat de rondleiding staan na het meelopen', async () => {
    // Anders is het lid het venster kwijt zodra het één keer een scherm bekijkt.
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    await gebruiker.click(screen.getByRole('button', { name: /Ga naar deze pagina/ }));

    expect(teller()).toBe('2 / 6');
  });
});

describe('de rondleiding per rol', () => {
  it.each([
    ['admin', 7],
    ['music_committee', 6],
    ['conductor', 5],
    ['member', 6],
  ])('geeft %s een eigen rondleiding van %i stappen', async (rol, aantal) => {
    const gebruiker = userEvent.setup();
    aanmelding.user = { id: 'lid-' + rol, role: rol };
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));

    expect(stippen()).toBe(aantal);
    expect(teller()).toBe(`1 / ${aantal}`);
  });

  it('valt bij een onbekende rol terug op de rondleiding voor leden', async () => {
    // Komt er ooit een rol bij zonder eigen rondleiding, dan hoort een lid geen
    // leeg venster of een fout te zien.
    const gebruiker = userEvent.setup();
    aanmelding.user = { id: 'lid-x', role: 'penningmeester' };
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));

    expect(stippen()).toBe(6);
  });

  it('stuurt de beheerder bij de tweede stap naar het modulescherm', async () => {
    // Modules staan standaard uit; deze stap is de enige plek waar een
    // beheerder dat te horen krijgt.
    const gebruiker = userEvent.setup();
    aanmelding.user = { id: 'beheerder-1', role: 'admin' };
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Volgende' }));

    await gebruiker.click(screen.getByRole('button', { name: /Ga naar deze pagina/ }));

    expect(router.navigeer).toHaveBeenCalledWith('/modules');
  });
});

describe('opnieuw aanbieden', () => {
  it('wist het onthouden zodat de rondleiding weer verschijnt', async () => {
    const gebruiker = userEvent.setup();
    toon().unmount();
    localStorage.setItem('onboarding_completed_lid-1', 'true');
    expect(hasCompletedOnboarding('lid-1')).toBe(true);

    resetOnboarding('lid-1');
    toon();

    expect(hasCompletedOnboarding('lid-1')).toBe(false);
    expect(screen.getByText('Welkom bij de app!')).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'Sla over' }));
  });

  it('raakt de rondleiding van een ander lid niet bij het wissen', () => {
    localStorage.setItem('onboarding_completed_lid-1', 'true');
    localStorage.setItem('onboarding_completed_lid-2', 'true');

    resetOnboarding('lid-1');

    expect(hasCompletedOnboarding('lid-1')).toBe(false);
    expect(hasCompletedOnboarding('lid-2')).toBe(true);
  });
});
