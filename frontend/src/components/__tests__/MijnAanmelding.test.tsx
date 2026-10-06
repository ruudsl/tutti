/**
 * Aan- en afmelden voor een repetitie vanuit de lijst en het dashboard.
 *
 * Wat hier vastligt:
 * - de eigen status uit de lijst is de beginstand (ingedrukte knop);
 * - een klik meldt aan of af, en een klik op de knop die al aan staat doet niets;
 * - de klik opent de regel eromheen niet;
 * - mislukt het, dan gaat de knop terug en ziet het lid waarom.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MijnAanmelding } from '../MijnAanmelding';
import * as spond from '../../api/spond';
import { showError } from '../../utils/toast';

vi.mock('../../api/spond', () => ({ updateMyAttendance: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showError: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (sleutel: string) => sleutel }) }));
vi.mock('../Icon', () => ({ Icon: () => null }));

const regelGeopend = vi.fn();

function toon(status: string | null) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <div onClick={regelGeopend} onKeyDown={regelGeopend} role="row">
        <MijnAanmelding rehearsalId="rep-1" status={status} />
      </div>
    </QueryClientProvider>,
  );
}

const aanmelden = () => screen.getByRole('button', { name: /rehearsals.attendance.accept/ });
const afmelden = () => screen.getByRole('button', { name: /rehearsals.attendance.decline/ });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spond.updateMyAttendance).mockImplementation(async (_id, aanwezig) => ({
    message: 'ok',
    status: aanwezig ? 'accepted' : 'declined',
    spondSynced: false,
  }));
});

describe('aan- en afmelden vanuit de lijst', () => {
  it('toont de eigen status als ingedrukte knop', () => {
    toon('accepted');

    expect(aanmelden()).toHaveAttribute('aria-pressed', 'true');
    expect(afmelden()).toHaveAttribute('aria-pressed', 'false');
  });

  it('meldt af met één klik, zonder de regel te openen', async () => {
    toon('accepted');

    await userEvent.click(afmelden());

    expect(spond.updateMyAttendance).toHaveBeenCalledWith('rep-1', false);
    await waitFor(() => expect(afmelden()).toHaveAttribute('aria-pressed', 'true'));
    expect(regelGeopend).not.toHaveBeenCalled();
  });

  it('opent de regel ook niet met Enter op een knop', async () => {
    toon(null);

    aanmelden().focus();
    await userEvent.keyboard('{Enter}');

    expect(regelGeopend).not.toHaveBeenCalled();
    expect(spond.updateMyAttendance).toHaveBeenCalledWith('rep-1', true);
  });

  it('doet niets bij een klik op wat al aan staat', async () => {
    toon('declined');

    await userEvent.click(afmelden());

    expect(spond.updateMyAttendance).not.toHaveBeenCalled();
  });

  it('zet de knop terug en meldt het als het mislukt', async () => {
    vi.mocked(spond.updateMyAttendance).mockRejectedValue(new Error('geen verbinding'));
    toon(null);

    await userEvent.click(aanmelden());

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(aanmelden()).toHaveAttribute('aria-pressed', 'false');
  });
});
