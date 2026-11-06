/**
 * De reservekopie-kaart op het dashboard.
 *
 * Een reservekopie omvat de hele installatie - alle verenigingen samen - en
 * de server geeft hem daarom alleen aan een superbeheerder
 * (`requireSuperAdmin` in backend/src/routes/backup.ts). Het dashboard toonde
 * de kaart aan elke verenigingsbeheerder, die dan bij het laden en bij elke
 * knop een 403 kreeg. Een pilotvereniging zou denken dat ze zelf een
 * reservekopie kan maken; dat kan ze niet.
 *
 * Wat hier vastligt: de kaart staat er voor de superbeheerder en voor
 * niemand anders. De opslagkaart blijft voor elke beheerder.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';

const { stand } = vi.hoisted(() => ({
  stand: { rol: 'admin', superbeheerder: false },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'geb-1', firstName: 'Anne', role: stand.rol } }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// Dezelfde vorm als het antwoord van GET /multi-association/am-i-super-admin.
vi.mock('../../hooks/useMultiAssociation', () => ({
  useIsSuperAdmin: () => ({ data: { isSuperAdmin: stand.superbeheerder } }),
}));

vi.mock('../../hooks/useDashboardWidgets', () => ({
  useDashboardWidgets: () => ({
    widgets: [],
    allWidgets: [],
    isEditMode: false,
    setIsEditMode: () => {},
    toggleWidget: () => {},
    reorderWidgets: () => {},
    setWidgetSize: () => {},
    resetToDefaults: () => {},
  }),
}));

vi.mock('../../components/DashboardWidgets', () => ({
  WidgetContainer: () => null,
  DashboardEditToggle: () => null,
}));

vi.mock('../../components/MfaSettings', () => ({ default: () => <div data-testid="mfa" /> }));
vi.mock('../../components/OpslagGebruik', () => ({ default: () => <div data-testid="opslag" /> }));
vi.mock('../../components/BackupSettings', () => ({ default: () => <div data-testid="reservekopie" /> }));
vi.mock('../../components/VerenigingsExport', () => ({ default: () => <div data-testid="verenigingsexport" /> }));
vi.mock('../../components/Startlijst', () => ({ default: () => <div data-testid="startlijst" /> }));

beforeEach(() => {
  stand.rol = 'admin';
  stand.superbeheerder = false;
});

describe('dashboard - reservekopie', () => {
  it('toont de reservekopie niet aan een verenigingsbeheerder', () => {
    render(<Dashboard />);

    expect(screen.getByTestId('opslag')).toBeInTheDocument();
    expect(screen.queryByTestId('reservekopie')).not.toBeInTheDocument();
  });

  it('geeft een verenigingsbeheerder wel de download van de eigen vereniging', () => {
    render(<Dashboard />);

    expect(screen.getByTestId('verenigingsexport')).toBeInTheDocument();
  });

  it('toont de reservekopie aan een beheerder die ook superbeheerder is', () => {
    stand.superbeheerder = true;
    render(<Dashboard />);

    expect(screen.getByTestId('reservekopie')).toBeInTheDocument();
  });

  it('toont de beheerder de startlijst', () => {
    render(<Dashboard />);

    expect(screen.getByTestId('startlijst')).toBeInTheDocument();
  });

  it('toont een gewoon lid geen beheerblok', () => {
    stand.rol = 'member';
    render(<Dashboard />);

    expect(screen.queryByTestId('startlijst')).not.toBeInTheDocument();

    expect(screen.queryByTestId('opslag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reservekopie')).not.toBeInTheDocument();
    expect(screen.queryByTestId('verenigingsexport')).not.toBeInTheDocument();
  });
});
