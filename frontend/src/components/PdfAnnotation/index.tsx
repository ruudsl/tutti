import React, { useState, useCallback, useEffect } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import AnnotationToolbar from './AnnotationToolbar';
import type { Annotation, ToolType, Stamp } from './types';
import { saveAnnotationOffline, getAnnotationsForPiece } from '../../lib/offlineDb';
import api from '../../api/client';

interface PdfAnnotatorProps {
  musicPieceId: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  onClose?: () => void;
}

export const PdfAnnotator: React.FC<PdfAnnotatorProps> = ({
  musicPieceId,
  pageNumber,
  pageWidth,
  pageHeight,
  scale,
}) => {
  const [activeTool, setActiveTool] = useState<ToolType>('freehand');
  const [color, setColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [opacity, setOpacity] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load annotations and stamps
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Try to load from server first
        const [annotationsRes, stampsRes] = await Promise.all([
          api.get(`/annotations/${musicPieceId}/${pageNumber}`).catch(() => null),
          api.get('/annotations/stamps').catch(() => null),
        ]);

        if (annotationsRes?.data) {
          setAnnotations(annotationsRes.data.map((a: any) => ({
            ...a,
            data: typeof a.data === 'string' ? JSON.parse(a.data) : a.data,
          })));
        } else {
          // Fall back to offline data
          const offlineAnnotations = await getAnnotationsForPiece(musicPieceId, pageNumber);
          setAnnotations(offlineAnnotations.map(a => ({
            ...a,
            data: typeof a.data === 'string' ? JSON.parse(a.data) : a.data,
            createdAt: a.lastModified,
            updatedAt: a.lastModified,
          })));
        }

        if (stampsRes?.data) {
          setStamps(stampsRes.data);
        } else {
          // Default stamps if server unavailable
          setStamps([
            { id: 'stamp-ff', name: 'ff', category: 'dynamics', svgData: '<text font-size="20" font-style="italic" font-weight="bold">ff</text>', isBuiltin: true },
            { id: 'stamp-f', name: 'f', category: 'dynamics', svgData: '<text font-size="20" font-style="italic" font-weight="bold">f</text>', isBuiltin: true },
            { id: 'stamp-p', name: 'p', category: 'dynamics', svgData: '<text font-size="20" font-style="italic" font-weight="bold">p</text>', isBuiltin: true },
            { id: 'stamp-check', name: 'Checkmark', category: 'general', svgData: '<path d="M5,15 L12,22 L25,5" fill="none" stroke="currentColor" stroke-width="3"/>', isBuiltin: true },
          ]);
        }
      } catch (error) {
        console.error('Failed to load annotations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [musicPieceId, pageNumber]);

  const handleAnnotationAdd = useCallback(async (newAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const annotation: Annotation = {
      ...newAnnotation,
      id,
      createdAt: now,
      updatedAt: now,
    };

    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(prev => [...prev, annotation]);

    // Save to offline storage and queue for sync
    try {
      await saveAnnotationOffline({
        id,
        musicPieceId: annotation.musicPieceId,
        pageNumber: annotation.pageNumber,
        annotationType: annotation.annotationType,
        data: JSON.stringify(annotation.data),
        color: annotation.color,
        strokeWidth: annotation.strokeWidth,
        opacity: annotation.opacity,
        isShared: annotation.isShared,
      });
    } catch (error) {
      console.error('Failed to save annotation offline:', error);
    }
  }, [annotations]);

  const handleAnnotationUpdate = useCallback((id: string, updates: Partial<Annotation>) => {
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(prev =>
      prev.map(a => a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a)
    );
  }, [annotations]);

  const handleAnnotationDelete = useCallback((id: string) => {
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, [annotations]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, annotations]);
    setUndoStack(prev => prev.slice(0, -1));
    setAnnotations(previousState);
  }, [undoStack, annotations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack(prev => prev.slice(0, -1));
    setAnnotations(nextState);
  }, [redoStack, annotations]);

  const handleClear = useCallback(() => {
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations([]);
  }, [annotations]);

  const selectedStamp = stamps.find(s => s.id === selectedStampId) || null;

  if (isLoading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Laden...</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '16px' }}>
      <AnnotationToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        opacity={opacity}
        onOpacityChange={setOpacity}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        stamps={stamps}
        selectedStamp={selectedStampId}
        onStampSelect={setSelectedStampId}
      />

      <div style={{ position: 'relative', width: pageWidth, height: pageHeight }}>
        <AnnotationCanvas
          pageNumber={pageNumber}
          musicPieceId={musicPieceId}
          width={pageWidth}
          height={pageHeight}
          scale={scale}
          activeTool={activeTool}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          selectedStamp={selectedStamp}
          annotations={annotations}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationUpdate={handleAnnotationUpdate}
          onAnnotationDelete={handleAnnotationDelete}
        />
      </div>
    </div>
  );
};

export default PdfAnnotator;
export * from './types';
export { AnnotationCanvas } from './AnnotationCanvas';
export { AnnotationToolbar } from './AnnotationToolbar';
