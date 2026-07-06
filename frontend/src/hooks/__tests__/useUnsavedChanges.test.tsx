import { describe, it, expect, vi } from 'vitest';
import { renderHook, render, screen, act, fireEvent } from '@testing-library/react';

// Mock i18n so ConfirmDialog and the hook can translate without initializing i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useUnsavedChanges } from '../useUnsavedChanges';

describe('useUnsavedChanges', () => {
  it('proceeds immediately when not dirty', () => {
    const { result } = renderHook(() => useUnsavedChanges(false));
    const proceed = vi.fn();

    act(() => {
      result.current.confirmClose(proceed);
    });

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toBeNull();
  });

  it('shows a confirmation dialog instead of proceeding when dirty', () => {
    const { result } = renderHook(() => useUnsavedChanges(true));
    const proceed = vi.fn();

    act(() => {
      result.current.confirmClose(proceed);
    });

    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.dialog).not.toBeNull();

    render(<>{result.current.dialog}</>);
    expect(screen.getByText('common.unsavedChanges.title')).toBeInTheDocument();
    expect(screen.getByText('common.unsavedChanges.message')).toBeInTheDocument();
  });

  it('proceeds when the user confirms discarding changes', () => {
    const { result } = renderHook(() => useUnsavedChanges(true));
    const proceed = vi.fn();

    act(() => {
      result.current.confirmClose(proceed);
    });

    const { unmount } = render(<>{result.current.dialog}</>);
    act(() => {
      fireEvent.click(screen.getByText('common.unsavedChanges.discard'));
    });
    unmount();

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toBeNull();
  });

  it('does not proceed when the user keeps editing', () => {
    const { result } = renderHook(() => useUnsavedChanges(true));
    const proceed = vi.fn();

    act(() => {
      result.current.confirmClose(proceed);
    });

    const { unmount } = render(<>{result.current.dialog}</>);
    act(() => {
      fireEvent.click(screen.getByText('common.unsavedChanges.keepEditing'));
    });
    unmount();

    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.dialog).toBeNull();
  });

  it('registers a beforeunload listener only while dirty', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: false },
    });
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender({ dirty: true });
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
