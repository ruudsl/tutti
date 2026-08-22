/**
 * De formulierlabels van vier instellingensecties horen bij hun veld.
 *
 * In alle vier stond het label lós naast het veld in dezelfde `.form-group`,
 * zonder `htmlFor` en zonder `id`. Een schermlezer kondigde dan "bewerkbaar
 * veld" aan zonder te zeggen wat erin moest, en klikken op het label zette de
 * aanwijzer nergens.
 *
 * `getByLabelText` is daarom de kern van deze tests: die vindt een veld alleen
 * als de koppeling er echt is. Zoeken via de omhullende `.form-group` zou ook
 * op de kapotte code slagen en bewijst niets.
 *
 * Drie van de zeven gevallen zijn met de hand gekoppeld: daar staat naast label
 * en veld ook nog een hulptekst in de `.form-group`, en `FormField` kloont maar
 * één kind. Die hulptekst hangt nu via `aria-describedby` aan het veld - anders
 * valt hij buiten beeld voor een schermlezer. Handwerk raakt eerder zoek dan
 * een component, dus juist díé gevallen staan hieronder.
 *
 * Het achtste geval labelt niets: de kop boven de aanbiederkeuze van WhatsApp
 * stond boven twee keuzerondjes die elk al in hun eigen label zitten. Daar
 * hoort geen `<label>` maar een groepskop, en de test daarop kijkt dat er geen
 * `<label>` meer staat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { ConcerttypenSectie } from '../Settings/ConcerttypenSectie';
import { M365GroepenSectie } from '../Settings/M365GroepenSectie';
import { MicrosoftSectie } from '../Settings/MicrosoftSectie';
import { WhatsAppSectie } from '../Settings/WhatsAppSectie';
import * as api from '../../api';
import type { MicrosoftConfig } from '../../types';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useConcerts', () => ({
  useAdminConcertTypes: () => ({ data: { types: [] }, isLoading: false }),
  useCreateConcertType: muteerder,
  useUpdateConcertType: muteerder,
  useDeleteConcertType: muteerder,
  useInitDefaultConcertTypes: muteerder,
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }], isLoading: false }),
}));

const microsoftIngesteld: MicrosoftConfig = {
  clientId: 'abc',
  tenantId: 'def',
  enabled: true,
  configured: true,
  redirectUri: 'https://tutti.example/callback',
};

/** Toon een sectie met een eigen queryclient eromheen. */
function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

/** Het veld dat bij dit label hoort moet zijn hulptekst als beschrijving dragen. */
function verwachtHulptekst(veld: HTMLElement, tekst: string) {
  const hulpId = veld.getAttribute('aria-describedby');
  expect(hulpId).toBeTruthy();
  expect(document.getElementById(hulpId!)).toHaveTextContent(tekst);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('concerttypen - labels gekoppeld aan hun veld', () => {
  /** Open het venster "concerttype toevoegen". */
  async function openFormulier() {
    const gebruiker = toon(<ConcerttypenSectie />);
    await gebruiker.click(screen.getByRole('button', { name: /settings\.concertTypes\.add/ }));
    return gebruiker;
  }

  it('vindt de drie velden van het formulier op hun labeltekst', async () => {
    await openFormulier();

    expect(screen.getByLabelText(/settings\.concertTypes\.value/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/settings\.concertTypes\.label/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('settings.concertTypes.sortOrder')).toHaveAttribute('type', 'number');
  });

  it('hangt de hulptekst onder het waardeveld aan dat veld', async () => {
    // Dit veld is met de hand gekoppeld: er staat een hulptekst onder.
    await openFormulier();

    verwachtHulptekst(screen.getByLabelText(/settings\.concertTypes\.value/), 'settings.concertTypes.valueHelp');
  });

  it('zet de aanwijzer in het labelveld als je op het label klikt', async () => {
    const gebruiker = await openFormulier();

    await gebruiker.click(screen.getByText(/settings\.concertTypes\.label/));
    expect(screen.getByLabelText(/settings\.concertTypes\.label/)).toHaveFocus();
  });
});

describe('m365-groepen - labels gekoppeld aan hun veld', () => {
  /** Open het venster "groepskoppeling toevoegen". */
  async function openFormulier() {
    vi.mocked(api.getM365GroupMappings).mockResolvedValue([]);
    const gebruiker = toon(<M365GroepenSectie microsoftIngesteld />);
    await gebruiker.click(await screen.findByRole('button', { name: /settings\.m365Groups\.add/ }));
    return gebruiker;
  }

  it('vindt soort, orkest en groepsnaam op hun labeltekst', async () => {
    await openFormulier();

    expect(screen.getByLabelText(/settings\.m365Groups\.type/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/settings\.m365Groups\.orchestra/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/settings\.m365Groups\.groupName/)).toHaveAttribute('type', 'text');
  });

  it('hangt de hulptekst onder het groepsnaamveld aan dat veld', async () => {
    // Met de hand gekoppeld: naast label en veld staat hier ook een hulptekst.
    await openFormulier();

    verwachtHulptekst(screen.getByLabelText(/settings\.m365Groups\.groupName/), 'settings.m365Groups.groupNameHelp');
  });
});

describe('microsoft-instellingen - label gekoppeld aan het omleidingsveld', () => {
  it('vindt de omleidings-URI op zijn labeltekst en hangt de uitleg eraan', () => {
    // Met de hand gekoppeld: onder het (alleen-lezen) veld staat een uitleg.
    toon(<MicrosoftSectie config={microsoftIngesteld} />);

    const veld = screen.getByLabelText('settings.microsoft.redirectUri');
    expect(veld).toHaveAttribute('readonly');
    verwachtHulptekst(veld, 'settings.microsoft.redirectUriHelp');
  });
});

describe('whatsapp-instellingen - groepskop boven de keuzerondjes', () => {
  it('zet boven de aanbiederkeuze een groepskop en geen label', async () => {
    // De twee aanbieders zijn keuzerondjes die elk al in hun eigen label zitten.
    // Een <label> erboven zou naar niets wijzen; het is een groepskop.
    vi.mocked(api.getWhatsAppConfig).mockResolvedValue(null as never);

    toon(<WhatsAppSectie />);

    const kop = await screen.findByText('settings.whatsapp.provider');
    expect(kop.tagName).toBe('SPAN');
    // De twee rondjes zitten zelf wél in een <label>; wat weg moest is het
    // veldlabel erboven.
    expect(kop.closest('.form-group')?.querySelector('label.form-label')).toBeNull();

    expect(screen.getByRole('radiogroup', { name: 'settings.whatsapp.provider' })).toBeInTheDocument();
  });
});
