/**
 * De reservekopie-kaart in de instellingen.
 *
 * Twee knoppen met heel verschillende gevolgen: downloaden is onschuldig,
 * terugzetten overschrijft alles wat er staat. Wat hier vastligt is dat het
 * verschil ook op het scherm zichtbaar is - de ene knop doet meteen iets, de
 * andere vraagt eerst om bevestiging - en dat een mislukking van beide bij de
 * gebruiker terechtkomt in plaats van in de console.
 *
 * WACHT, GEEN BEWIJS, rond de verenigingsgrens. Dat de reservekopie over de
 * grens van de vereniging heen ging is aan de serverkant gerepareerd; deze
 * frontend kan er niets aan doen en kon er ook niets aan doen. Hij vraagt om
 * "de" reservekopie zonder ergens een vereniging te noemen, en dat blijft het
 * enige wat hij hier kan waarborgen: geen enkele knop op dit scherm laat een
 * andere vereniging kiezen. De tests die dat vastleggen zijn ook op de oude
 * code groen; ze heten daarom wacht.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackupSettings from '../BackupSettings';
import { getBackupInfo, downloadBackup, restoreBackup } from '../../api';
import type { BackupInfo } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../api', () => ({
  getBackupInfo: vi.fn(),
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const infoOphalen = vi.mocked(getBackupInfo);
const downloaden = vi.mocked(downloadBackup);
const terugzetten = vi.mocked(restoreBackup);
const succes = vi.mocked(showSuccess);
const fout = vi.mocked(showError);

const INFO: BackupInfo = {
  database: { size: 1024, sizeFormatted: '1 KB' },
  pdfFiles: { count: 12, sizeFormatted: '3 MB', size: 3_000_000 },
  mp3Files: { count: 4, sizeFormatted: '40 MB', size: 40_000_000 },
  total: { size: 43_001_024, sizeFormatted: '43 MB' },
};

/** Het verborgen bestandsveld waar de knop 'terugzetten' op klikt. */
function bestandsveld(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function zipBestand(naam = 'reservekopie.zip') {
  return new File(['inhoud'], naam, { type: 'application/zip' });
}

let herladen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  infoOphalen.mockResolvedValue(INFO);
  downloaden.mockResolvedValue(undefined);
  terugzetten.mockResolvedValue({ message: 'ok' } as never);
  herladen = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, reload: herladen },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BackupSettings, de kaart zelf', () => {
  it('toont eerst dat er geladen wordt en daarna de omvang per soort', async () => {
    render(<BackupSettings />);

    expect(screen.getByText('common.loading')).toBeInTheDocument();

    expect(await screen.findByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('12 (3 MB)')).toBeInTheDocument();
    expect(screen.getByText('4 (40 MB)')).toBeInTheDocument();
    expect(screen.getByText('43 MB')).toBeInTheDocument();
  });

  /**
   * Bewust vastgelegd zoals het is: mislukt het ophalen van de omvang, dan
   * blijft de kaart bruikbaar en verdwijnen alleen de getallen. De gebruiker
   * krijgt hier geen melding van. Dat is een gat - zie het verslag - maar het
   * repareren ervan vraagt een nieuwe vertaalsleutel in gedeelde bestanden.
   */
  it('blijft bruikbaar als de omvang niet op te halen is', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    infoOphalen.mockRejectedValueOnce(new Error('server weg'));

    render(<BackupSettings />);

    expect(await screen.findByRole('button', { name: 'backup.download' })).toBeEnabled();
    expect(screen.queryByText('43 MB')).not.toBeInTheDocument();
  });

  /**
   * WACHT. Ook op de oude code groen. De kaart noemt nergens een vereniging:
   * er is geen keuzelijst en geen invoerveld dat een andere vereniging kan
   * aanwijzen, dus de aanroep gaat altijd over de eigen vereniging.
   */
  it('biedt geen enkele manier om een andere vereniging te kiezen', async () => {
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(infoOphalen).toHaveBeenCalledWith();
  });
});

describe('BackupSettings, downloaden', () => {
  it('downloadt en meldt dat het gelukt is', async () => {
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    await bediener.click(screen.getByRole('button', { name: 'backup.download' }));

    await waitFor(() => expect(downloaden).toHaveBeenCalledTimes(1));
    expect(succes).toHaveBeenCalledWith('backup.downloaded');
  });

  it('toont de reden van de server als het downloaden mislukt', async () => {
    downloaden.mockRejectedValueOnce({ response: { data: { error: 'Geen rechten voor deze reservekopie' } } });
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    await bediener.click(screen.getByRole('button', { name: 'backup.download' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Geen rechten voor deze reservekopie'));
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    downloaden.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    await bediener.click(screen.getByRole('button', { name: 'backup.download' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('backup.errorDownload'));
  });

  it('zet de knop op slot zolang het downloaden loopt', async () => {
    let losmaken: () => void = () => {};
    downloaden.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          losmaken = resolve;
        }),
    );
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    await bediener.click(screen.getByRole('button', { name: 'backup.download' }));

    const bezig = await screen.findByRole('button', { name: 'backup.downloading' });
    expect(bezig).toBeDisabled();
    expect(screen.getByRole('button', { name: 'backup.restore' })).toBeDisabled();

    losmaken();
    await waitFor(() => expect(screen.getByRole('button', { name: 'backup.download' })).toBeEnabled());
  });
});

describe('BackupSettings, terugzetten', () => {
  it('vraagt eerst om bevestiging voordat er iets overschreven wordt', async () => {
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    fireEvent.change(bestandsveld(), { target: { files: [zipBestand()] } });

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('backup.confirmRestore');
    expect(terugzetten).not.toHaveBeenCalled();
  });

  it('doet niets als er geen bestand gekozen wordt', async () => {
    render(<BackupSettings />);
    await screen.findByText('43 MB');

    fireEvent.change(bestandsveld(), { target: { files: [] } });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('laat het gekozen bestand los als de gebruiker afziet van terugzetten', async () => {
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');
    fireEvent.change(bestandsveld(), { target: { files: [zipBestand()] } });

    const venster = await screen.findByRole('alertdialog');
    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(terugzetten).not.toHaveBeenCalled();
    expect(bestandsveld().value).toBe('');
  });

  /**
   * WACHT. Ook op de oude code groen. Na het terugzetten wordt de pagina
   * herladen, zodat er geen gegevens van vóór het terugzetten op het scherm
   * blijven staan. Dat is de enige waarborg die de frontend hier heeft.
   */
  it('zet terug en herlaadt daarna de pagina', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const bediener = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BackupSettings />);
    await screen.findByText('43 MB');
    const bestand = zipBestand();
    fireEvent.change(bestandsveld(), { target: { files: [bestand] } });

    const venster = await screen.findByRole('alertdialog');
    await bediener.click(within(venster).getByRole('button', { name: 'backup.restoreButton' }));

    await waitFor(() => expect(terugzetten).toHaveBeenCalledWith(bestand));
    expect(succes).toHaveBeenCalledWith('backup.restored');
    expect(herladen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(herladen).toHaveBeenCalledTimes(1);
  });

  it('toont de reden van de server als het terugzetten mislukt en herlaadt niet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    terugzetten.mockRejectedValueOnce({ response: { data: { error: 'Reservekopie hoort bij een andere vereniging' } } });
    const bediener = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BackupSettings />);
    await screen.findByText('43 MB');
    fireEvent.change(bestandsveld(), { target: { files: [zipBestand()] } });

    const venster = await screen.findByRole('alertdialog');
    await bediener.click(within(venster).getByRole('button', { name: 'backup.restoreButton' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('Reservekopie hoort bij een andere vereniging'));
    vi.advanceTimersByTime(5000);
    expect(herladen).not.toHaveBeenCalled();
    expect(bestandsveld().value).toBe('');
  });

  it('valt terug op een eigen tekst als de server geen reden geeft', async () => {
    terugzetten.mockRejectedValueOnce(new Error('netwerk'));
    const bediener = userEvent.setup();
    render(<BackupSettings />);
    await screen.findByText('43 MB');
    fireEvent.change(bestandsveld(), { target: { files: [zipBestand()] } });

    const venster = await screen.findByRole('alertdialog');
    await bediener.click(within(venster).getByRole('button', { name: 'backup.restoreButton' }));

    await waitFor(() => expect(fout).toHaveBeenCalledWith('backup.errorRestore'));
  });
});
