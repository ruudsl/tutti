import { useState, useCallback, useRef } from 'react';

export interface UploadItem {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface UseUploadProgressOptions {
  onComplete?: (results: { uploaded: unknown[]; errors?: unknown[] }) => void;
  onError?: (error: Error) => void;
}

export function useUploadProgress(_options: UseUploadProgressOptions = {}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startUpload = useCallback((files: File[]) => {
    const newUploads: UploadItem[] = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      filename: file.name,
      progress: 0,
      status: 'pending',
    }));
    setUploads(newUploads);
    setIsUploading(true);
    abortControllerRef.current = new AbortController();
    return newUploads;
  }, []);

  const updateUpload = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads(prev => prev.map(upload =>
      upload.id === id ? { ...upload, ...updates } : upload
    ));
  }, []);

  const setAllUploading = useCallback((progress: number) => {
    setUploads(prev => prev.map(upload => ({
      ...upload,
      progress: upload.status === 'complete' || upload.status === 'error' ? upload.progress : progress,
      status: upload.status === 'complete' || upload.status === 'error' ? upload.status : 'uploading',
    })));
  }, []);

  const markComplete = useCallback((id: string) => {
    updateUpload(id, { progress: 100, status: 'complete' });
  }, [updateUpload]);

  const markError = useCallback((id: string, error: string) => {
    updateUpload(id, { status: 'error', error });
  }, [updateUpload]);

  const markAllComplete = useCallback(() => {
    setUploads(prev => prev.map(upload => ({
      ...upload,
      progress: upload.status !== 'error' ? 100 : upload.progress,
      status: upload.status !== 'error' ? 'complete' : upload.status,
    })));
    setIsUploading(false);
  }, []);

  const markAllProcessing = useCallback(() => {
    setUploads(prev => prev.map(upload => ({
      ...upload,
      status: upload.status !== 'error' && upload.status !== 'complete' ? 'processing' : upload.status,
    })));
  }, []);

  const cancelAll = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploads([]);
    setIsUploading(false);
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(upload => upload.status !== 'complete'));
  }, []);

  const clearAll = useCallback(() => {
    setUploads([]);
    setIsUploading(false);
  }, []);

  const totalProgress = uploads.length > 0
    ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length
    : 0;

  const pendingCount = uploads.filter(u => u.status === 'pending' || u.status === 'uploading').length;
  const completedCount = uploads.filter(u => u.status === 'complete').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;

  return {
    uploads,
    isUploading,
    totalProgress,
    pendingCount,
    completedCount,
    errorCount,
    startUpload,
    updateUpload,
    setAllUploading,
    markComplete,
    markError,
    markAllComplete,
    markAllProcessing,
    cancelAll,
    clearCompleted,
    clearAll,
    abortSignal: abortControllerRef.current?.signal,
  };
}

export default useUploadProgress;
