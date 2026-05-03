import React, { useState, useCallback, useEffect } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import AnnotationToolbar from './AnnotationToolbar';
import type { Annotation, ToolType, Stamp, ShapeType } from './types';
import { saveAnnotationOffline, getAnnotationsForPiece } from '../../lib/offlineDb';
import api from '../../api/client';

const DEFAULT_STAMPS: Stamp[] = [
  // Dynamics
  { id: 'stamp-fff', name: 'fff', category: 'dynamics', svgData: '<text x="15" y="20" font-size="16" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">fff</text>', isBuiltin: true },
  { id: 'stamp-ff', name: 'ff', category: 'dynamics', svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">ff</text>', isBuiltin: true },
  { id: 'stamp-f', name: 'f', category: 'dynamics', svgData: '<text x="15" y="20" font-size="20" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">f</text>', isBuiltin: true },
  { id: 'stamp-mf', name: 'mf', category: 'dynamics', svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">mf</text>', isBuiltin: true },
  { id: 'stamp-mp', name: 'mp', category: 'dynamics', svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">mp</text>', isBuiltin: true },
  { id: 'stamp-p', name: 'p', category: 'dynamics', svgData: '<text x="15" y="20" font-size="20" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">p</text>', isBuiltin: true },
  { id: 'stamp-pp', name: 'pp', category: 'dynamics', svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">pp</text>', isBuiltin: true },
  { id: 'stamp-ppp', name: 'ppp', category: 'dynamics', svgData: '<text x="15" y="20" font-size="16" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">ppp</text>', isBuiltin: true },
  { id: 'stamp-sfz', name: 'sfz', category: 'dynamics', svgData: '<text x="15" y="20" font-size="16" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">sfz</text>', isBuiltin: true },
  { id: 'stamp-fp', name: 'fp', category: 'dynamics', svgData: '<text x="15" y="20" font-size="18" font-style="italic" font-weight="bold" text-anchor="middle" fill="currentColor">fp</text>', isBuiltin: true },
  { id: 'stamp-cresc', name: 'cresc.', category: 'dynamics', svgData: '<text x="15" y="20" font-size="12" font-style="italic" text-anchor="middle" fill="currentColor">cresc.</text>', isBuiltin: true },
  { id: 'stamp-decresc', name: 'decresc.', category: 'dynamics', svgData: '<text x="15" y="20" font-size="11" font-style="italic" text-anchor="middle" fill="currentColor">decresc.</text>', isBuiltin: true },
  { id: 'stamp-crescendo', name: 'Crescendo', category: 'dynamics', svgData: '<path d="M5 15 L25 8 M5 15 L25 22" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },
  { id: 'stamp-decrescendo', name: 'Decrescendo', category: 'dynamics', svgData: '<path d="M5 8 L25 15 M5 22 L25 15" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },

  // Tempo
  { id: 'stamp-rit', name: 'rit.', category: 'tempo', svgData: '<text x="15" y="20" font-size="14" font-style="italic" text-anchor="middle" fill="currentColor">rit.</text>', isBuiltin: true },
  { id: 'stamp-ritard', name: 'ritard.', category: 'tempo', svgData: '<text x="15" y="20" font-size="12" font-style="italic" text-anchor="middle" fill="currentColor">ritard.</text>', isBuiltin: true },
  { id: 'stamp-rall', name: 'rall.', category: 'tempo', svgData: '<text x="15" y="20" font-size="14" font-style="italic" text-anchor="middle" fill="currentColor">rall.</text>', isBuiltin: true },
  { id: 'stamp-accel', name: 'accel.', category: 'tempo', svgData: '<text x="15" y="20" font-size="13" font-style="italic" text-anchor="middle" fill="currentColor">accel.</text>', isBuiltin: true },
  { id: 'stamp-atempo', name: 'a tempo', category: 'tempo', svgData: '<text x="15" y="20" font-size="11" font-style="italic" text-anchor="middle" fill="currentColor">a tempo</text>', isBuiltin: true },
  { id: 'stamp-rubato', name: 'rubato', category: 'tempo', svgData: '<text x="15" y="20" font-size="12" font-style="italic" text-anchor="middle" fill="currentColor">rubato</text>', isBuiltin: true },
  { id: 'stamp-fermata', name: 'Fermata', category: 'tempo', svgData: '<circle cx="15" cy="20" r="3" fill="currentColor"/><path d="M6 20 C6 10, 24 10, 24 20" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },
  { id: 'stamp-breath', name: 'Breath Mark', category: 'tempo', svgData: '<text x="15" y="22" font-size="24" text-anchor="middle" fill="currentColor">,</text>', isBuiltin: true },
  { id: 'stamp-caesura', name: 'Caesura', category: 'tempo', svgData: '<path d="M10 8 L14 22 M16 8 L20 22" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },

  // Articulation
  { id: 'stamp-staccato', name: 'Staccato', category: 'articulation', svgData: '<circle cx="15" cy="15" r="3" fill="currentColor"/>', isBuiltin: true },
  { id: 'stamp-accent', name: 'Accent', category: 'articulation', svgData: '<path d="M8 10 L15 15 L8 20" stroke="currentColor" stroke-width="2.5" fill="none"/>', isBuiltin: true },
  { id: 'stamp-marcato', name: 'Marcato', category: 'articulation', svgData: '<path d="M10 20 L15 8 L20 20" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },
  { id: 'stamp-tenuto', name: 'Tenuto', category: 'articulation', svgData: '<line x1="8" y1="15" x2="22" y2="15" stroke="currentColor" stroke-width="3"/>', isBuiltin: true },
  { id: 'stamp-trill', name: 'Trill', category: 'articulation', svgData: '<text x="15" y="20" font-size="16" font-style="italic" text-anchor="middle" fill="currentColor">tr</text>', isBuiltin: true },
  { id: 'stamp-mordent', name: 'Mordent', category: 'articulation', svgData: '<path d="M5 15 L10 10 L15 15 L20 10 L25 15" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },
  { id: 'stamp-turn', name: 'Turn', category: 'articulation', svgData: '<path d="M5 12 C8 8, 12 8, 15 12 C18 16, 22 16, 25 12" stroke="currentColor" stroke-width="2" fill="none"/>', isBuiltin: true },
  { id: 'stamp-portato', name: 'Portato', category: 'articulation', svgData: '<circle cx="15" cy="10" r="2.5" fill="currentColor"/><line x1="10" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2.5"/>', isBuiltin: true },

  // Navigation
  { id: 'stamp-coda', name: 'Coda', category: 'navigation', svgData: '<circle cx="15" cy="15" r="6" stroke="currentColor" stroke-width="2" fill="none"/><line x1="15" y1="6" x2="15" y2="24" stroke="currentColor" stroke-width="2"/><line x1="6" y1="15" x2="24" y2="15" stroke="currentColor" stroke-width="2"/>', isBuiltin: true },
  { id: 'stamp-segno', name: 'Segno', category: 'navigation', svgData: '<path d="M10 22 L20 8" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="10" r="2.5" fill="currentColor"/><circle cx="22" cy="20" r="2.5" fill="currentColor"/>', isBuiltin: true },
  { id: 'stamp-repeat', name: 'Repeat', category: 'navigation', svgData: '<text x="15" y="20" font-size="20" text-anchor="middle" fill="currentColor">%</text>', isBuiltin: true },
  { id: 'stamp-dc', name: 'D.C.', category: 'navigation', svgData: '<text x="15" y="20" font-size="14" font-style="italic" text-anchor="middle" fill="currentColor">D.C.</text>', isBuiltin: true },
  { id: 'stamp-ds', name: 'D.S.', category: 'navigation', svgData: '<text x="15" y="20" font-size="14" font-style="italic" text-anchor="middle" fill="currentColor">D.S.</text>', isBuiltin: true },
  { id: 'stamp-fine', name: 'Fine', category: 'navigation', svgData: '<text x="15" y="20" font-size="14" font-style="italic" text-anchor="middle" fill="currentColor">Fine</text>', isBuiltin: true },

  // General
  { id: 'stamp-check', name: 'Vinkje', category: 'general', svgData: '<path d="M6 15 L12 21 L24 9" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', isBuiltin: true },
  { id: 'stamp-cross', name: 'Kruis', category: 'general', svgData: '<path d="M8 8 L22 22 M22 8 L8 22" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>', isBuiltin: true },
  { id: 'stamp-star', name: 'Ster', category: 'general', svgData: '<path d="M15 5 L17 12 L24 12 L19 17 L21 24 L15 20 L9 24 L11 17 L6 12 L13 12 Z" fill="currentColor"/>', isBuiltin: true },
  { id: 'stamp-question', name: 'Vraag', category: 'general', svgData: '<text x="15" y="22" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">?</text>', isBuiltin: true },
  { id: 'stamp-exclaim', name: 'Uitroep', category: 'general', svgData: '<text x="15" y="22" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">!</text>', isBuiltin: true },
  { id: 'stamp-circle', name: 'Cirkel', category: 'general', svgData: '<circle cx="15" cy="15" r="10" stroke="currentColor" stroke-width="2.5" fill="none"/>', isBuiltin: true },
  { id: 'stamp-arrow-up', name: 'Pijl omhoog', category: 'general', svgData: '<path d="M15 24 L15 8 M9 14 L15 8 L21 14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', isBuiltin: true },
  { id: 'stamp-arrow-down', name: 'Pijl omlaag', category: 'general', svgData: '<path d="M15 6 L15 22 M9 16 L15 22 L21 16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', isBuiltin: true },
  { id: 'stamp-heart', name: 'Hart', category: 'general', svgData: '<path d="M15 24 C6 17 4 11 9 8 C12 6 15 9 15 9 C15 9 18 6 21 8 C26 11 24 17 15 24" fill="currentColor"/>', isBuiltin: true },
  { id: 'stamp-plus', name: 'Plus', category: 'general', svgData: '<path d="M15 6 L15 24 M6 15 L24 15" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>', isBuiltin: true },
];

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
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [color, setColor] = useState('#DC2626');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [opacity, setOpacity] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [stamps, setStamps] = useState<Stamp[]>(DEFAULT_STAMPS);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [annotationsRes, stampsRes] = await Promise.all([
          api.get(`/annotations/${musicPieceId}/${pageNumber}`).catch(() => null),
          api.get('/annotations/stamps').catch(() => null),
        ]);

        if (annotationsRes?.data) {
          setAnnotations(annotationsRes.data.map((a: Annotation) => ({
            ...a,
            data: typeof a.data === 'string' ? JSON.parse(a.data as unknown as string) : a.data,
          })));
        } else {
          const offlineAnnotations = await getAnnotationsForPiece(musicPieceId, pageNumber);
          setAnnotations(offlineAnnotations.map(a => ({
            ...a,
            data: typeof a.data === 'string' ? JSON.parse(a.data) : a.data,
            createdAt: a.lastModified,
            updatedAt: a.lastModified,
          })));
        }

        if (stampsRes?.data && stampsRes.data.length > 0) {
          setStamps(stampsRes.data);
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
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#6b7280',
        fontSize: '14px',
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: '3px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 12px',
        }} />
        Annotaties laden...
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '8px',
    }}>
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
        selectedShapeType={selectedShapeType}
        onShapeTypeChange={setSelectedShapeType}
      />

      <div style={{
        position: 'relative',
        width: pageWidth,
        height: pageHeight,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}>
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
          selectedShapeType={selectedShapeType}
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
