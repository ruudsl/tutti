/**
 * De labels van de vakantie-instellingen horen bij hun veld.
 *
 * Label en veld stonden los naast elkaar in dezelfde `form-group`, zonder
 * `htmlFor` en zonder `id`. Een schermlezer kondigde een bewerkbaar veld aan
 * zonder te zeggen wat erin moest, klikken op het label zette de aanwijzer
 * nergens, en een test kon het veld niet op naam vinden.
 *
 * `getByLabelText` is dus geen willekeurige zoekmethode maar de kern van de
 * test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Drie velden van het formulier voor een eigen vakantie lopen sinds de ombouw
 * via `components/FormField`. Twee gevallen niet, en juist die staan hieronder,
 * want handwerk raakt eerder zoek dan een component:
 *
 *  - De regiokeuze heeft een hulptekst in dezelfde `form-group`. FormField
 *    neemt één kindelement, dus die is met de hand gekoppeld, met een
 *    `aria-describedby` zodat de uitleg wel bij het veld hoort.
 *  - "Weergaveopties" stond boven twee aankruisvakjes. Die dragen hun eigen
 *    naam al; de kop erboven is geen veldlabel maar een groepskop, en hoort
 *    dus een `<span>` te zijn waar een `role="group"` naar wijst.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HolidaySettings from '../HolidaySettings';

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

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'admin' } }),
}));

const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useHolidays', () => ({
  useHolidays: () => ({
    data: { holidays: [], meta: { availableYears: [2026] } },
    isLoading: false,
  }),
  useHolidaySettings: () => ({
    data: {
      region: 'midden',
      showHolidaysInCalendar: true,
      autoBlockRehearsals: false,
      regions: [
        { value: 'noord', labelDutch: 'Noord' },
        { value: 'midden', labelDutch: 'Midden' },
        { value: 'zuid', labelDutch: 'Zuid' },
      ],
    },
    isLoading: false,
  }),
  useUpdateHolidaySettings: muteerder,
  useSyncHolidays: muteerder,
  useCreateCustomHoliday: muteerder,
  useDeleteCustomHoliday: muteerder,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/** Vouw het formulier "eigen vakantie toevoegen" open. */
async function openToevoegformulier() {
  const gebruiker = userEvent.setup();
  render(<HolidaySettings />);
  await gebruiker.click(await screen.findByRole('button', { name: /holidays.addCustom\b/ }));
  return gebruiker;
}

describe('vakantie-instellingen - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het toevoegformulier op hun labeltekst', async () => {
    await openToevoegformulier();

    expect(screen.getByLabelText('common.name')).toHaveAttribute('placeholder', 'holidays.namePlaceholder');
    expect(screen.getByLabelText('holidays.startDate')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('holidays.endDate')).toHaveAttribute('type', 'date');
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = await openToevoegformulier();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('common.name'));
    await gebruiker.keyboard('Studieweek');

    expect(screen.getByLabelText('common.name')).toHaveValue('Studieweek');
  });

  it('brengt de hulptekst bij de regiokeuze mee, niet alleen het label', async () => {
    render(<HolidaySettings />);

    const regio = screen.getByLabelText('holidays.region');
    expect(regio.tagName).toBe('SELECT');

    // De uitleg staat buiten het label, dus alleen aria-describedby brengt hem
    // bij het veld. Zonder die verwijzing valt hij buiten beeld voor een
    // schermlezer, ook al staat hij er zichtbaar onder.
    const uitleg = screen.getByText('holidays.regionDescription');
    expect(regio).toHaveAttribute('aria-describedby', uitleg.getAttribute('id'));
  });

  it('geeft de weergaveopties een groepskop in plaats van een label', () => {
    render(<HolidaySettings />);

    // "Weergaveopties" labelt geen veld maar staat boven twee aankruisvakjes
    // die hun eigen naam al dragen. Daar hoort een groepskop.
    const groep = screen.getByRole('group', { name: 'holidays.displayOptions' });
    expect(groep).toBeInTheDocument();

    const kop = screen.getByText('holidays.displayOptions');
    expect(kop.tagName).toBe('SPAN');
    expect(kop).toHaveClass('form-label');

    // De vakjes zelf zijn wel gewoon op naam te vinden.
    expect(screen.getByLabelText('holidays.showInCalendar')).toBeChecked();
    expect(screen.getByLabelText('holidays.autoBlockRehearsals')).not.toBeChecked();
  });
});
