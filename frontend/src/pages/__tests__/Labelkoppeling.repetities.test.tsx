/**
 * De formulierlabels van drie repetitieschermen horen bij hun veld.
 *
 * `Labelkoppeling.test.tsx` hiernaast dekt het repetitieformulier zelf; dit
 * bestand hoort bij de restpunten daaromheen: het aanwezigheidstabblad, de
 * spond-kaart en het genereerformulier. Ook daar stond het label lós naast het
 * veld in dezelfde `.form-group`, zonder `htmlFor` en zonder `id`.
 *
 * `getByLabelText` is de kern van deze tests: die vindt een veld alleen als de
 * koppeling er echt is. Zoeken via de omhullende `.form-group` zou ook op de
 * kapotte code slagen en bewijst dus niets.
 *
 * Twee gevallen op de spond-kaart zijn met de hand gekoppeld. Onder het
 * wachtwoordveld hangt soms een hulptekst, en bij de groepskeuze staan de
 * keuzelijst en een knop samen in een eigen omhulsel; `FormField` kloont maar
 * één kind en past daar dus niet. De hulptekst hangt via `aria-describedby` aan
 * het veld, anders valt hij buiten beeld voor een schermlezer.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AttendanceTab } from '../Rehearsals/AttendanceTab';
import { GenerateForm } from '../Rehearsals/GenerateForm';
import { SpondCard } from '../Rehearsals/SpondCard';
import type { SpondConfig } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

/** Toon het aanwezigheidstabblad met één orkest, zodat ook het orkestfilter er staat. */
function toonAanwezigheid() {
  render(
    <AttendanceTab
      attendanceFrom="2026-01-01"
      setAttendanceFrom={() => {}}
      attendanceTo="2026-06-30"
      setAttendanceTo={() => {}}
      orchestras={[{ id: 'ork-1', name: 'Harmonie' } as never]}
      attendanceOrchestraId=""
      setAttendanceOrchestraId={() => {}}
      attendanceRehearsalCount={0}
      attendanceLoading={false}
      sortedAttendance={[]}
      attendanceSortBy="name"
      setAttendanceSortBy={() => {}}
    />,
  );
  return userEvent.setup();
}

/** Toon de spond-kaart met het instelformulier open. */
function toonSpond(config: SpondConfig | null, wachtwoordBekend: boolean) {
  render(
    <SpondCard
      spondConfig={config}
      isSyncing={false}
      handleSyncAll={() => {}}
      showSpondSetup
      setShowSpondSetup={() => {}}
      spondForm={{ username: '', password: '', groupId: '' }}
      setSpondForm={() => {}}
      handleLoadGroups={() => {}}
      spondGroups={[{ id: 'grp-1', name: 'Harmonie', memberCount: 40 } as never]}
      loadingGroups={false}
      spondWachtwoordBekend={wachtwoordBekend}
      spondFormBruikbaar
      handleSaveSpondConfig={() => {}}
      setRemovingSpondConfig={() => {}}
    />,
  );
  return userEvent.setup();
}

describe('aanwezigheidstabblad - labels gekoppeld aan hun veld', () => {
  it('vindt de drie filtervelden op hun labeltekst', () => {
    toonAanwezigheid();

    expect(screen.getByLabelText('rehearsals.attendance.from')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('rehearsals.attendance.to')).toHaveValue('2026-06-30');
    expect(screen.getByLabelText('rehearsals.orchestra').tagName).toBe('SELECT');
  });

  it('zet de aanwijzer in het orkestfilter als je op het label klikt', async () => {
    const gebruiker = toonAanwezigheid();

    await gebruiker.click(screen.getByText('rehearsals.orchestra'));
    expect(screen.getByLabelText('rehearsals.orchestra')).toHaveFocus();
  });
});

describe('genereerformulier - labels gekoppeld aan hun veld', () => {
  it('vindt begin- en einddatum op hun labeltekst', () => {
    render(
      <GenerateForm
        genFrom="2026-09-01"
        setGenFrom={() => {}}
        genTo="2026-12-31"
        setGenTo={() => {}}
        handleGenerate={() => {}}
        isGenerating={false}
      />,
    );

    expect(screen.getByLabelText('rehearsals.generateFrom')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('rehearsals.generateTo')).toHaveValue('2026-12-31');
  });
});

describe('spond-kaart - labels gekoppeld aan hun veld', () => {
  it('vindt gebruikersnaam, wachtwoord en groepskeuze op hun labeltekst', () => {
    toonSpond(null, false);

    expect(screen.getByLabelText('rehearsals.spond.username')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('rehearsals.spond.password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('rehearsals.spond.selectGroup').tagName).toBe('SELECT');
  });

  it('zet de aanwijzer in het gebruikersnaamveld als je op het label klikt', async () => {
    const gebruiker = toonSpond(null, false);

    await gebruiker.click(screen.getByText('rehearsals.spond.username'));
    expect(screen.getByLabelText('rehearsals.spond.username')).toHaveFocus();
  });

  it('hangt de hulptekst over het bewaarde wachtwoord aan het wachtwoordveld', () => {
    // Dit veld is met de hand gekoppeld: naast label en veld staat er soms ook
    // een hulptekst. Zonder aria-describedby valt die buiten beeld.
    toonSpond({ configured: true } as SpondConfig, true);

    const veld = screen.getByLabelText('rehearsals.spond.password');
    const hulpId = veld.getAttribute('aria-describedby');
    expect(hulpId).toBeTruthy();
    expect(document.getElementById(hulpId!)).toHaveTextContent('rehearsals.spond.passwordKeepHint');
  });

  it('laat de beschrijving weg zolang er geen wachtwoord bewaard is', () => {
    toonSpond(null, false);

    expect(screen.getByLabelText('rehearsals.spond.password')).not.toHaveAttribute('aria-describedby');
  });
});
