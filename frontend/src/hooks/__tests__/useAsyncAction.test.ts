/**
 * Tests voor de hook om een asynchrone actie mee uit te voeren.
 *
 * De meldingen (toasts) en de vertaling worden gemockt, zodat we kunnen zien
 * welke melding er bij welke afloop hoort. Verder gaat het om de laadstand, wat
 * er met een mislukking gebeurt en of de vorige fout wel of niet blijft staan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'nl' } }),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(() => 'toast-1'),
  dismissToast: vi.fn(),
}));

vi.mock('../../utils/errors', () => ({
  getLocalizedErrorMessage: vi.fn(() => 'Er ging iets mis'),
}));

import { useAsyncAction, useSimpleAsyncAction } from '../useAsyncAction';
import { showSuccess, showError, showLoading, dismissToast } from '../../utils/toast';
import { getLocalizedErrorMessage } from '../../utils/errors';

const melding = { showSuccess: vi.mocked(showSuccess), showError: vi.mocked(showError) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(showLoading).mockReturnValue('toast-1');
  vi.mocked(getLocalizedErrorMessage).mockReturnValue('Er ging iets mis');
});

describe('useAsyncAction - geslaagde afloop', () => {
  it('geeft het resultaat terug en bewaart het', async () => {
    const actie = vi.fn().mockResolvedValue({ id: 7 });
    const { result } = renderHook(() => useAsyncAction(actie));

    let uitkomst: unknown;
    await act(async () => {
      uitkomst = await result.current[0]();
    });

    expect(uitkomst).toEqual({ id: 7 });
    expect(result.current[1].result).toEqual({ id: 7 });
    expect(result.current[1].error).toBeNull();
  });

  it('geeft de meegegeven argumenten door aan de actie', async () => {
    const actie = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAsyncAction(actie));

    await act(async () => {
      await result.current[0]('a', 2, true);
    });

    expect(actie).toHaveBeenCalledWith('a', 2, true);
  });

  it('toont de opgegeven succesmelding', async () => {
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockResolvedValue(1), { successMessage: 'Opgeslagen' }));

    await act(async () => {
      await result.current[0]();
    });

    expect(melding.showSuccess).toHaveBeenCalledWith('Opgeslagen');
  });

  it('bouwt de succesmelding op met het resultaat', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockResolvedValue({ aantal: 3 }), {
        successMessage: (r: { aantal: number }) => `${r.aantal} stuks bewaard`,
      }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(melding.showSuccess).toHaveBeenCalledWith('3 stuks bewaard');
  });

  it('toont geen melding wanneer dat is uitgezet', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockResolvedValue(1), { successMessage: 'Opgeslagen', showToast: false }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(melding.showSuccess).not.toHaveBeenCalled();
  });

  it('roept de onSuccess-callback aan met het resultaat', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockResolvedValue('klaar'), { onSuccess }));

    await act(async () => {
      await result.current[0]();
    });

    expect(onSuccess).toHaveBeenCalledWith('klaar');
  });
});

describe('useAsyncAction - mislukte afloop', () => {
  it('geeft niets terug en bewaart de fout', async () => {
    const fout = new Error('kapot');
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockRejectedValue(fout)));

    let uitkomst: unknown = 'nog niets';
    await act(async () => {
      uitkomst = await result.current[0]();
    });

    expect(uitkomst).toBeUndefined();
    expect(result.current[1].error).toBe(fout);
    expect(result.current[1].errorMessage).toBe('Er ging iets mis');
  });

  it('laat de fout vertalen en toont hem als melding', async () => {
    const fout = new Error('kapot');
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockRejectedValue(fout)));

    await act(async () => {
      await result.current[0]();
    });

    expect(getLocalizedErrorMessage).toHaveBeenCalledWith(fout, expect.any(Function), 'nl');
    expect(melding.showError).toHaveBeenCalledWith('Er ging iets mis');
  });

  it('gebruikt een eigen foutmelding in plaats van de vertaalde', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockRejectedValue(new Error('kapot')), { errorMessage: 'Niet gelukt' }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(result.current[1].errorMessage).toBe('Niet gelukt');
    expect(getLocalizedErrorMessage).not.toHaveBeenCalled();
  });

  it('bouwt een eigen foutmelding op met de fout zelf', async () => {
    const fout = new Error('kapot');
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockRejectedValue(fout), {
        errorMessage: (e: unknown) => `mislukt: ${(e as Error).message}`,
      }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(result.current[1].errorMessage).toBe('mislukt: kapot');
  });

  it('roept de onError-callback aan met de fout', async () => {
    const onError = vi.fn();
    const fout = new Error('kapot');
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockRejectedValue(fout), { onError }));

    await act(async () => {
      await result.current[0]();
    });

    expect(onError).toHaveBeenCalledWith(fout);
  });

  it('houdt de foutmelding stil wanneer meldingen uit staan', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockRejectedValue(new Error('kapot')), { showToast: false }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(melding.showError).not.toHaveBeenCalled();
    expect(result.current[1].errorMessage).toBe('Er ging iets mis');
  });
});

describe('useAsyncAction - laadstand', () => {
  it('staat op laden zolang de actie loopt en daarna niet meer', async () => {
    let afmaken: ((waarde: string) => void) | undefined;
    const actie = vi.fn(() => new Promise<string>((resolve) => (afmaken = resolve)));
    const { result } = renderHook(() => useAsyncAction(actie));

    act(() => {
      void result.current[0]();
    });
    await waitFor(() => expect(result.current[1].isLoading).toBe(true));

    await act(async () => {
      afmaken?.('klaar');
    });

    await waitFor(() => expect(result.current[1].isLoading).toBe(false));
  });

  it('staat ook na een mislukking niet meer op laden', async () => {
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockRejectedValue(new Error('kapot'))));

    await act(async () => {
      await result.current[0]();
    });

    expect(result.current[1].isLoading).toBe(false);
  });

  it('toont een laadmelding en haalt die na afloop weer weg', async () => {
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockResolvedValue(1), { loadingMessage: 'Bezig...' }));

    await act(async () => {
      await result.current[0]();
    });

    expect(showLoading).toHaveBeenCalledWith('Bezig...');
    expect(dismissToast).toHaveBeenCalledWith('toast-1');
  });

  it('haalt de laadmelding ook weg wanneer het misgaat', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(vi.fn().mockRejectedValue(new Error('kapot')), { loadingMessage: 'Bezig...' }),
    );

    await act(async () => {
      await result.current[0]();
    });

    expect(dismissToast).toHaveBeenCalledWith('toast-1');
  });
});

describe('useAsyncAction - fout onthouden of wissen', () => {
  it('wist de vorige fout bij een nieuwe poging', async () => {
    const actie = vi.fn().mockRejectedValueOnce(new Error('kapot')).mockResolvedValue('gelukt');
    const { result } = renderHook(() => useAsyncAction(actie));

    await act(async () => {
      await result.current[0]();
    });
    expect(result.current[1].error).not.toBeNull();

    await act(async () => {
      await result.current[0]();
    });

    expect(result.current[1].error).toBeNull();
    expect(result.current[1].errorMessage).toBeNull();
  });

  it('houdt de vorige fout vast wanneer daarom gevraagd wordt', async () => {
    let afmaken: (() => void) | undefined;
    const actie = vi
      .fn()
      .mockRejectedValueOnce(new Error('kapot'))
      .mockImplementation(() => new Promise<void>((resolve) => (afmaken = resolve)));
    const { result } = renderHook(() => useAsyncAction(actie, { resetErrorOnExecute: false }));

    await act(async () => {
      await result.current[0]();
    });
    const eersteFout = result.current[1].error;

    act(() => {
      void result.current[0]();
    });
    // Zolang de tweede poging loopt blijft de oude fout zichtbaar.
    expect(result.current[1].error).toBe(eersteFout);

    await act(async () => {
      afmaken?.();
    });
  });

  it('zet met reset alles terug op de beginstand', async () => {
    const { result } = renderHook(() => useAsyncAction(vi.fn().mockResolvedValue('klaar')));

    await act(async () => {
      await result.current[0]();
    });
    expect(result.current[1].result).toBe('klaar');

    act(() => {
      result.current[1].reset();
    });

    expect(result.current[1].result).toBeNull();
    expect(result.current[1].error).toBeNull();
    expect(result.current[1].errorMessage).toBeNull();
    expect(result.current[1].isLoading).toBe(false);
  });
});

describe('useSimpleAsyncAction', () => {
  it('geeft alleen de uitvoerfunctie en de laadstand terug', async () => {
    const actie = vi.fn().mockResolvedValue('klaar');
    const { result } = renderHook(() => useSimpleAsyncAction(actie, { successMessage: 'Opgeslagen' }));

    expect(result.current[1]).toBe(false);

    await act(async () => {
      await result.current[0]('x');
    });

    expect(actie).toHaveBeenCalledWith('x');
    expect(melding.showSuccess).toHaveBeenCalledWith('Opgeslagen');
    expect(result.current[1]).toBe(false);
  });
});
