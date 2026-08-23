/**
 * De labels van de ledenpagina horen bij hun veld.
 *
 * Dit is de pagina waar de E2E-flow "lid toevoegen en aan een orkest koppelen"
 * doorheen loopt. Die moest het veld Voornaam opzoeken via de omhullende
 * `.form-group`, omdat label en veld daar los naast elkaar stonden zonder
 * `htmlFor` en zonder `id`. Een schermlezer kondigde een bewerkbaar veld aan
 * zonder te zeggen wat erin moest, en klikken op het label zette de aanwijzer
 * nergens.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * De filters en het rolveld lopen via `components/FormField`. De vier velden
 * van het ledenformulier zijn met de hand gekoppeld: in dezelfde `form-group`
 * staat naast label en veld ook nog een foutmelding (en bij het wachtwoord een
 * hulptekst), en FormField neemt maar één kind. Juist dat handwerk staat
 * hieronder ook, want handwerk raakt eerder zoek dan een component.
 *
 * De twee blokken aankruisvakjes zijn geen veld maar een groep: elk vakje zit
 * al in zijn eigen label. Hun kop is daarom een groepskop geworden in plaats
 * van een `<label>` die naar niets wees.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Users from '../Users';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="eigen-velden" />,
}));

vi.mock('../../utils/downloadUrl', () => ({ useDownloadToken: () => null }));

const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useCreateUser: muteerder,
  useUpdateUser: muteerder,
  useDeleteUser: muteerder,
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb', clef: 'sol' }], isLoading: false }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }], isLoading: false }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Open het venster "Nieuw lid", zoals de E2E-flow dat ook doet. */
async function openLedenvenster() {
  const gebruiker = userEvent.setup();
  render(<Users />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: /users.newMember/ }));
  return { gebruiker, venster: await screen.findByRole('dialog') };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ledenpagina - labels gekoppeld aan hun veld', () => {
  it('vindt de filtervelden boven de lijst op hun labeltekst', async () => {
    render(<Users />, { wrapper: wikkel });

    expect(await screen.findByLabelText('common.search')).toHaveAttribute('placeholder', 'users.searchPlaceholder');
    expect(screen.getByLabelText('orchestras.title').tagName).toBe('SELECT');
    expect(screen.getByLabelText('instruments.title').tagName).toBe('SELECT');
  });

  it('vindt de velden van het ledenvenster op hun labeltekst', async () => {
    const { venster } = await openLedenvenster();

    // Dit is precies wat de E2E-flow doet, en wat vóór de koppeling niet kon
    expect(within(venster).getByLabelText(/users.firstName/)).toHaveAttribute('type', 'text');
    expect(within(venster).getByLabelText(/users.lastName/)).toHaveAttribute('type', 'text');
    expect(within(venster).getByLabelText(/users.email/)).toHaveAttribute('type', 'email');
    expect(within(venster).getByLabelText(/users.password/)).toHaveAttribute('type', 'password');
    expect(within(venster).getByLabelText('users.role').tagName).toBe('SELECT');
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const { gebruiker, venster } = await openLedenvenster();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(within(venster).getByText(/users.firstName/));
    await gebruiker.keyboard('Nieuw');

    expect(within(venster).getByLabelText(/users.firstName/)).toHaveValue('Nieuw');
  });

  it('wijst de foutmelding aan het veld toe waar hij bij hoort', async () => {
    const { gebruiker, venster } = await openLedenvenster();

    // Leeg opslaan laat de verplichte velden hun melding tonen
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    const voornaam = await within(venster).findByLabelText(/users.firstName/);
    const melding = within(venster).getAllByText('errors.required')[0];

    // Zonder aria-describedby staat de melding er wel, maar hoort een
    // schermlezer hem niet bij het veld waar hij over gaat.
    expect(voornaam).toHaveAttribute('aria-describedby', melding.getAttribute('id'));
  });

  it('geeft de aankruisvakjes een groepskop in plaats van een label dat nergens heen wijst', async () => {
    const { venster } = await openLedenvenster();

    // De vakjes zelf zitten al in hun eigen label; de kop erboven benoemt de
    // groep. Een <label> zou hier een lege belofte zijn.
    const orkesten = within(venster).getByRole('group', { name: 'users.orchestras' });
    expect(within(orkesten).getByRole('checkbox', { name: /Harmonie/ })).toBeInTheDocument();

    expect(within(venster).getByRole('group', { name: 'users.instruments' })).toBeInTheDocument();
  });
});
