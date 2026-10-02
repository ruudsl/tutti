/**
 * De sectie op Instellingen om tweestapsverificatie verplicht te stellen.
 *
 * De beheerder kiest: niemand, beheerders en bestuur, of iedereen. Aanzetten
 * kan alleen wie het zelf al heeft; de sectie zegt dat vooraf en laat dan
 * niet opslaan. Een weigering van de server komt als melding binnen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TweestapSectie } from '../Settings/TweestapSectie';
import { getTweestapStand, zetTweestapStand } from '../../api';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api', () => ({ getTweestapStand: vi.fn(), zetTweestapStand: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const ophalen = vi.mocked(getTweestapStand);
const opslaan = vi.mocked(zetTweestapStand);

beforeEach(() => {
  vi.clearAllMocks();
  ophalen.mockResolvedValue({ stand: 'uit', zelfAan: true });
  opslaan.mockResolvedValue(undefined);
});

const keuze = (stand: string) => screen.getByRole('radio', { name: `settings.tweestap.stand.${stand}` });
const opslaanKnop = () => screen.getByRole('button', { name: 'common.save' });

/** Tot de stand binnen is, staan de keuzes uit. */
const wachtTotGeladen = () => waitFor(() => expect(keuze('uit')).toBeEnabled());

describe('instellingen - tweestap verplicht', () => {
  it('toont de huidige stand', async () => {
    ophalen.mockResolvedValue({ stand: 'beheer', zelfAan: true });
    render(<TweestapSectie />);

    expect(await screen.findByRole('radio', { name: 'settings.tweestap.stand.beheer' })).toBeChecked();
    expect(opslaanKnop()).toBeDisabled();
  });

  it('slaat een nieuwe stand op', async () => {
    const gebruiker = userEvent.setup();
    render(<TweestapSectie />);
    await wachtTotGeladen();

    await gebruiker.click(keuze('iedereen'));
    await gebruiker.click(opslaanKnop());

    expect(opslaan).toHaveBeenCalledWith('iedereen');
    expect(showSuccess).toHaveBeenCalledWith('settings.saved');
  });

  it('laat een beheerder zonder tweestap het niet verplichten, en zegt waarom', async () => {
    ophalen.mockResolvedValue({ stand: 'uit', zelfAan: false });
    const gebruiker = userEvent.setup();
    render(<TweestapSectie />);
    await wachtTotGeladen();

    await gebruiker.click(keuze('beheer'));

    expect(screen.getByRole('alert')).toHaveTextContent('settings.tweestap.eerstZelf');
    expect(opslaanKnop()).toBeDisabled();
  });

  it('laat een beheerder zonder tweestap het wel weer uitzetten', async () => {
    ophalen.mockResolvedValue({ stand: 'iedereen', zelfAan: false });
    const gebruiker = userEvent.setup();
    render(<TweestapSectie />);
    await wachtTotGeladen();

    await gebruiker.click(keuze('uit'));
    await gebruiker.click(opslaanKnop());

    expect(opslaan).toHaveBeenCalledWith('uit');
  });

  it('toont de melding van de server als opslaan mislukt', async () => {
    opslaan.mockRejectedValue({ response: { data: { error: 'Zet eerst zelf tweestapsverificatie aan.' } } });
    const gebruiker = userEvent.setup();
    render(<TweestapSectie />);
    await wachtTotGeladen();

    await gebruiker.click(keuze('iedereen'));
    await gebruiker.click(opslaanKnop());

    expect(showError).toHaveBeenCalledWith('Zet eerst zelf tweestapsverificatie aan.');
  });
});
