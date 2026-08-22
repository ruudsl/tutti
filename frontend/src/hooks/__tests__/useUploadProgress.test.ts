/**
 * Tests voor de voortgang van uploads.
 *
 * Deze hook houdt per bestand bij hoe ver het is. Getoetst wordt vooral wat er
 * met een bestand gebeurt dat al klaar of al mislukt is wanneer de rest nog
 * doorloopt: dat mag niet stilletjes teruggezet worden. Verder de tellers, het
 * gemiddelde en het afbreken.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUploadProgress } from '../useUploadProgress';

/** Maakt een bestand met een naam; de inhoud doet er niet toe. */
const bestand = (naam: string) => new File(['inhoud'], naam, { type: 'application/pdf' });

/** Start een upload van de opgegeven bestandsnamen en geeft de hook terug. */
function metUploads(...namen: string[]) {
  const hook = renderHook(() => useUploadProgress());
  act(() => {
    hook.result.current.startUpload(namen.map(bestand));
  });
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUploadProgress - starten', () => {
  it('begint zonder uploads', () => {
    const { result } = renderHook(() => useUploadProgress());

    expect(result.current.uploads).toEqual([]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.totalProgress).toBe(0);
  });

  it('zet elk bestand klaar op nul procent', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');

    expect(result.current.uploads.map((u) => u.filename)).toEqual(['een.pdf', 'twee.pdf']);
    expect(result.current.uploads.every((u) => u.progress === 0 && u.status === 'pending')).toBe(true);
    expect(result.current.isUploading).toBe(true);
  });

  it('geeft elk bestand een eigen kenmerk', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf', 'drie.pdf');

    const kenmerken = result.current.uploads.map((u) => u.id);
    expect(new Set(kenmerken).size).toBe(3);
  });

  it('levert een afbreeksignaal dat nog niet afgebroken is', () => {
    const { result } = metUploads('een.pdf');

    expect(result.current.abortSignal).toBeInstanceOf(AbortSignal);
    expect(result.current.abortSignal?.aborted).toBe(false);
  });

  it('vervangt de vorige ronde bij een nieuwe start', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');

    act(() => {
      result.current.startUpload([bestand('drie.pdf')]);
    });

    expect(result.current.uploads.map((u) => u.filename)).toEqual(['drie.pdf']);
  });
});

describe('useUploadProgress - voortgang bijwerken', () => {
  it('werkt een enkel bestand bij', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');
    const id = result.current.uploads[0].id;

    act(() => {
      result.current.updateUpload(id, { progress: 42, status: 'uploading' });
    });

    expect(result.current.uploads[0]).toMatchObject({ progress: 42, status: 'uploading' });
    expect(result.current.uploads[1]).toMatchObject({ progress: 0, status: 'pending' });
  });

  it('zet alle lopende bestanden op dezelfde stand', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');

    act(() => {
      result.current.setAllUploading(30);
    });

    expect(result.current.uploads.every((u) => u.progress === 30 && u.status === 'uploading')).toBe(true);
  });

  it('laat een al klaar bestand met rust bij het bijwerken van de rest', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');
    const id = result.current.uploads[0].id;

    act(() => {
      result.current.markComplete(id);
    });
    act(() => {
      result.current.setAllUploading(30);
    });

    expect(result.current.uploads[0]).toMatchObject({ progress: 100, status: 'complete' });
    expect(result.current.uploads[1]).toMatchObject({ progress: 30, status: 'uploading' });
  });

  it('laat een mislukt bestand met rust bij het bijwerken van de rest', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');
    const id = result.current.uploads[0].id;

    act(() => {
      result.current.markError(id, 'te groot');
    });
    act(() => {
      result.current.setAllUploading(30);
    });

    expect(result.current.uploads[0]).toMatchObject({ status: 'error', error: 'te groot', progress: 0 });
  });

  it('zet een bestand op klaar met honderd procent', () => {
    const { result } = metUploads('een.pdf');

    act(() => {
      result.current.markComplete(result.current.uploads[0].id);
    });

    expect(result.current.uploads[0]).toMatchObject({ progress: 100, status: 'complete' });
  });

  it('bewaart bij een fout de reden', () => {
    const { result } = metUploads('een.pdf');

    act(() => {
      result.current.markError(result.current.uploads[0].id, 'bestand is beschadigd');
    });

    expect(result.current.uploads[0]).toMatchObject({ status: 'error', error: 'bestand is beschadigd' });
  });
});

describe('useUploadProgress - afronden', () => {
  it('zet alles op klaar behalve de mislukte bestanden', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');
    const mislukt = result.current.uploads[1].id;

    act(() => {
      result.current.markError(mislukt, 'te groot');
    });
    act(() => {
      result.current.markAllComplete();
    });

    expect(result.current.uploads[0]).toMatchObject({ status: 'complete', progress: 100 });
    expect(result.current.uploads[1]).toMatchObject({ status: 'error', progress: 0 });
    expect(result.current.isUploading).toBe(false);
  });

  it('zet alles op verwerken behalve wat al klaar of mislukt is', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf', 'drie.pdf');
    const [eerste, tweede] = result.current.uploads.map((u) => u.id);

    act(() => {
      result.current.markComplete(eerste);
      result.current.markError(tweede, 'te groot');
    });
    act(() => {
      result.current.markAllProcessing();
    });

    expect(result.current.uploads.map((u) => u.status)).toEqual(['complete', 'error', 'processing']);
  });

  it('blijft aan het uploaden tijdens het verwerken', () => {
    const { result } = metUploads('een.pdf');

    act(() => {
      result.current.markAllProcessing();
    });

    expect(result.current.isUploading).toBe(true);
  });
});

describe('useUploadProgress - opruimen en afbreken', () => {
  it('breekt de lopende verzoeken af en maakt de lijst leeg', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');
    const signaal = result.current.abortSignal;

    act(() => {
      result.current.cancelAll();
    });

    expect(signaal?.aborted).toBe(true);
    expect(result.current.uploads).toEqual([]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.abortSignal).toBeUndefined();
  });

  it('haalt alleen de afgeronde bestanden uit de lijst', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf', 'drie.pdf');
    const [eerste, tweede] = result.current.uploads.map((u) => u.id);

    act(() => {
      result.current.markComplete(eerste);
      result.current.markError(tweede, 'te groot');
    });
    act(() => {
      result.current.clearCompleted();
    });

    expect(result.current.uploads.map((u) => u.filename)).toEqual(['twee.pdf', 'drie.pdf']);
  });

  it('maakt met clearAll de hele lijst leeg', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf');

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.uploads).toEqual([]);
    expect(result.current.isUploading).toBe(false);
  });
});

describe('useUploadProgress - tellers', () => {
  it('rekent het gemiddelde over alle bestanden uit', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf', 'drie.pdf');
    const [eerste, tweede] = result.current.uploads.map((u) => u.id);

    act(() => {
      result.current.updateUpload(eerste, { progress: 100 });
      result.current.updateUpload(tweede, { progress: 50 });
    });

    expect(result.current.totalProgress).toBe(50);
  });

  it('telt wat er nog loopt, wat klaar is en wat mislukt is', () => {
    const { result } = metUploads('een.pdf', 'twee.pdf', 'drie.pdf', 'vier.pdf');
    const [eerste, tweede, derde] = result.current.uploads.map((u) => u.id);

    act(() => {
      result.current.markComplete(eerste);
      result.current.markError(tweede, 'te groot');
      result.current.updateUpload(derde, { status: 'uploading', progress: 20 });
    });

    expect(result.current.completedCount).toBe(1);
    expect(result.current.errorCount).toBe(1);
    // Het uploadende en het nog wachtende bestand tellen allebei mee.
    expect(result.current.pendingCount).toBe(2);
  });

  it('houdt het gemiddelde op nul zonder bestanden', () => {
    const { result } = renderHook(() => useUploadProgress());

    expect(result.current.totalProgress).toBe(0);
    expect(result.current.pendingCount).toBe(0);
  });
});
