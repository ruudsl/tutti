/**
 * De kaart om de gegevens van de eigen vereniging te downloaden. Een klik
 * haalt de ZIP op; lukt dat niet, dan ziet de beheerder waarom.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerenigingsExport from '../VerenigingsExport';
import { downloadVerenigingsExport } from '../../api';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api', () => ({ downloadVerenigingsExport: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

beforeEach(() => vi.clearAllMocks());

describe('gegevens van de vereniging downloaden', () => {
  it('haalt de ZIP op en meldt dat het gelukt is', async () => {
    vi.mocked(downloadVerenigingsExport).mockResolvedValue(undefined);
    render(<VerenigingsExport />);

    await userEvent.click(screen.getByRole('button', { name: 'verenigingsExport.knop' }));

    expect(downloadVerenigingsExport).toHaveBeenCalledTimes(1);
    expect(showSuccess).toHaveBeenCalledWith('verenigingsExport.gedownload');
  });

  it('meldt waarom het niet lukte', async () => {
    vi.mocked(downloadVerenigingsExport).mockRejectedValue(new Error('Toegang geweigerd vanaf dit adres'));
    render(<VerenigingsExport />);

    await userEvent.click(screen.getByRole('button', { name: 'verenigingsExport.knop' }));

    expect(showError).toHaveBeenCalledWith('Toegang geweigerd vanaf dit adres');
    expect(screen.getByRole('button', { name: 'verenigingsExport.knop' })).toBeEnabled();
  });
});
