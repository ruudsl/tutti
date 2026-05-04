import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
  AnnotationCanvasProps,
  Point,
  Stroke,
  Annotation,
  ShapeAnnotation,
  TextAnnotation,
  StampAnnotation,
  HighlightAnnotation,
  ShapeType,
} from './types';

const CURSOR_STYLES: Record<string, string> = {
  select: 'default',
  freehand: 'crosshair',
  highlight: 'text',
  text: 'text',
  stamp: 'copy',
  shape: 'crosshair',
  eraser: 'not-allowed',
};

export const AnnotationCanvas: React.FC<AnnotationCanvasProps & {
  selectedShapeType?: ShapeType;
}> = ({
  pageNumber,
  musicPieceId,
  width,
  height,
  scale,
  activeTool,
  color,
  strokeWidth,
  opacity,
  selectedStamp,
  selectedShapeType = 'rectangle',
  stamps,
  annotations,
  onAnnotationAdd,
  onAnnotationUpdate: _onAnnotationUpdate,
  onAnnotationDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [stampImages, setStampImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation, dpr: number) => {
    ctx.save();
    ctx.globalAlpha = annotation.opacity;
    const s = scale * dpr;

    switch (annotation.annotationType) {
      case 'freehand': {
        const stroke = annotation.data as Stroke;
        if (stroke.points.length < 2) break;

        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.strokeWidth * s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x * s, stroke.points[0].y * s);

        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1];
          const p1 = stroke.points[i];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x * s, p0.y * s, midX * s, midY * s);
        }

        const lastPoint = stroke.points[stroke.points.length - 1];
        ctx.lineTo(lastPoint.x * s, lastPoint.y * s);
        ctx.stroke();
        break;
      }

      case 'highlight': {
        const highlight = annotation.data as HighlightAnnotation;
        if (highlight.points.length < 2) break;

        ctx.fillStyle = annotation.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(highlight.points[0].x * s, highlight.points[0].y * s);

        for (const point of highlight.points) {
          ctx.lineTo(point.x * s, point.y * s);
        }

        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'text': {
        const text = annotation.data as TextAnnotation;
        ctx.fillStyle = annotation.color;
        ctx.font = `${text.fontSize * s}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(text.content, text.position.x * s, text.position.y * s);
        break;
      }

      case 'stamp': {
        const stamp = annotation.data as StampAnnotation;
        const img = stampImages.get(stamp.stampId);

        if (img && img.complete) {
          ctx.translate(stamp.position.x * s, stamp.position.y * s);
          ctx.rotate((stamp.rotation * Math.PI) / 180);
          const stampSize = 30 * stamp.scale * s / dpr;
          ctx.drawImage(img, -stampSize / 2, -stampSize / 2, stampSize, stampSize);
        } else {
          ctx.fillStyle = annotation.color;
          ctx.font = `bold ${20 * s / dpr}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', stamp.position.x * s, stamp.position.y * s);
        }
        break;
      }

      case 'shape': {
        const shape = annotation.data as ShapeAnnotation;
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.strokeWidth * s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const x1 = shape.start.x * s;
        const y1 = shape.start.y * s;
        const x2 = shape.end.x * s;
        const y2 = shape.end.y * s;

        ctx.beginPath();

        switch (shape.shapeType) {
          case 'rectangle':
            ctx.rect(x1, y1, x2 - x1, y2 - y1);
            break;
          case 'circle': {
            const radiusX = Math.abs(x2 - x1) / 2;
            const radiusY = Math.abs(y2 - y1) / 2;
            const centerX = (x1 + x2) / 2;
            const centerY = (y1 + y2) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            break;
          }
          case 'line':
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            break;
          case 'arrow': {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = 15 * s / dpr;
            ctx.lineTo(
              x2 - headLength * Math.cos(angle - Math.PI / 6),
              y2 - headLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(x2, y2);
            ctx.lineTo(
              x2 - headLength * Math.cos(angle + Math.PI / 6),
              y2 - headLength * Math.sin(angle + Math.PI / 6)
            );
            break;
          }
        }

        if (shape.filled) {
          ctx.fillStyle = annotation.color;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }, [scale, stampImages]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const annotation of annotations) {
      drawAnnotation(ctx, annotation, dpr);
    }

    if (isDrawing && currentStroke.length > 0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      const s = scale * dpr;

      if (activeTool === 'freehand' || activeTool === 'highlight') {
        ctx.strokeStyle = color;
        ctx.lineWidth = (activeTool === 'highlight' ? strokeWidth * 5 : strokeWidth) * s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (activeTool === 'highlight') {
          ctx.globalAlpha = 0.3;
        }

        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x * s, currentStroke[0].y * s);

        for (let i = 1; i < currentStroke.length; i++) {
          const p0 = currentStroke[i - 1];
          const p1 = currentStroke[i];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x * s, p0.y * s, midX * s, midY * s);
        }

        const lastPoint = currentStroke[currentStroke.length - 1];
        ctx.lineTo(lastPoint.x * s, lastPoint.y * s);
        ctx.stroke();
      }

      if (shapeStart && activeTool === 'shape') {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth * s;
        ctx.setLineDash([5 * dpr, 5 * dpr]);
        ctx.beginPath();

        const lastPoint = currentStroke[currentStroke.length - 1] || shapeStart;
        const x1 = shapeStart.x * s;
        const y1 = shapeStart.y * s;
        const x2 = lastPoint.x * s;
        const y2 = lastPoint.y * s;

        switch (selectedShapeType) {
          case 'rectangle':
            ctx.rect(x1, y1, x2 - x1, y2 - y1);
            break;
          case 'circle': {
            const radiusX = Math.abs(x2 - x1) / 2;
            const radiusY = Math.abs(y2 - y1) / 2;
            const centerX = (x1 + x2) / 2;
            const centerY = (y1 + y2) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            break;
          }
          case 'line':
          case 'arrow':
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            if (selectedShapeType === 'arrow') {
              const angle = Math.atan2(y2 - y1, x2 - x1);
              const headLength = 15 * s / dpr;
              ctx.lineTo(
                x2 - headLength * Math.cos(angle - Math.PI / 6),
                y2 - headLength * Math.sin(angle - Math.PI / 6)
              );
              ctx.moveTo(x2, y2);
              ctx.lineTo(
                x2 - headLength * Math.cos(angle + Math.PI / 6),
                y2 - headLength * Math.sin(angle + Math.PI / 6)
              );
            }
            break;
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, [annotations, isDrawing, currentStroke, shapeStart, activeTool, selectedShapeType, color, strokeWidth, opacity, scale, dpr, drawAnnotation]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width * scale * dpr;
    canvas.height = height * scale * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(1, 1);
    }

    redraw();
  }, [width, height, scale, dpr, redraw]);

  useEffect(() => {
    const loadStampImages = async () => {
      const newImages = new Map(stampImages);
      let hasChanges = false;

      for (const stamp of stamps) {
        if (!newImages.has(stamp.id)) {
          const img = new Image();
          const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">${stamp.svgData}</svg>`;
          const blob = new Blob([svgContent], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);

          await new Promise<void>((resolve) => {
            img.onload = () => {
              newImages.set(stamp.id, img);
              hasChanges = true;
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            img.src = url;
          });
        }
      }

      if (hasChanges) {
        setStampImages(newImages);
      }
    };

    if (stamps.length > 0) {
      loadStampImages();
    }
  }, [stamps]);

  const handleTextSubmit = useCallback(() => {
    if (textInputValue.trim() && textInputPosition) {
      const textAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
        musicPieceId,
        pageNumber,
        annotationType: 'text',
        data: {
          position: textInputPosition,
          content: textInputValue.trim(),
          fontSize: 16,
          color,
        } as TextAnnotation,
        color,
        strokeWidth,
        opacity,
        isShared: false,
      };
      onAnnotationAdd(textAnnotation);
    }
    setShowTextInput(false);
    setTextInputValue('');
    setTextInputPosition(null);
  }, [textInputValue, textInputPosition, musicPieceId, pageNumber, color, strokeWidth, opacity, onAnnotationAdd]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'select') return;

    const point = getCanvasPoint(e);

    if (activeTool === 'stamp' && selectedStamp) {
      const stampAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
        musicPieceId,
        pageNumber,
        annotationType: 'stamp',
        data: {
          position: point,
          stampId: selectedStamp.id,
          scale: 1,
          color,
          rotation: 0,
        } as StampAnnotation,
        color,
        strokeWidth,
        opacity,
        isShared: false,
      };
      onAnnotationAdd(stampAnnotation);
      return;
    }

    if (activeTool === 'text') {
      setTextInputPosition(point);
      setShowTextInput(true);
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    setIsDrawing(true);

    if (activeTool === 'shape') {
      setShapeStart(point);
    }

    setCurrentStroke([point]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    setCurrentStroke(prev => [...prev, point]);
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (activeTool === 'eraser') {
      const eraserRadius = strokeWidth * 3;
      const toDelete: string[] = [];

      for (const annotation of annotations) {
        if (annotation.annotationType === 'freehand') {
          const stroke = annotation.data as Stroke;
          for (const strokePoint of stroke.points) {
            for (const erasePoint of currentStroke) {
              const distance = Math.sqrt(
                Math.pow(strokePoint.x - erasePoint.x, 2) +
                Math.pow(strokePoint.y - erasePoint.y, 2)
              );
              if (distance < eraserRadius) {
                toDelete.push(annotation.id);
                break;
              }
            }
            if (toDelete.includes(annotation.id)) break;
          }
        }
      }

      toDelete.forEach(id => onAnnotationDelete(id));
    } else if (activeTool === 'freehand' && currentStroke.length > 1) {
      const freehandAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
        musicPieceId,
        pageNumber,
        annotationType: 'freehand',
        data: {
          points: currentStroke,
          color,
          width: strokeWidth,
          opacity,
        } as Stroke,
        color,
        strokeWidth,
        opacity,
        isShared: false,
      };
      onAnnotationAdd(freehandAnnotation);
    } else if (activeTool === 'highlight' && currentStroke.length > 1) {
      const highlightAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
        musicPieceId,
        pageNumber,
        annotationType: 'highlight',
        data: {
          points: currentStroke,
          color,
          opacity: 0.3,
        } as HighlightAnnotation,
        color,
        strokeWidth: strokeWidth * 5,
        opacity: 0.3,
        isShared: false,
      };
      onAnnotationAdd(highlightAnnotation);
    } else if (activeTool === 'shape' && shapeStart && currentStroke.length > 0) {
      const lastPoint = currentStroke[currentStroke.length - 1];
      const shapeAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
        musicPieceId,
        pageNumber,
        annotationType: 'shape',
        data: {
          shapeType: selectedShapeType,
          start: shapeStart,
          end: lastPoint,
          color,
          strokeWidth,
          filled: false,
        } as ShapeAnnotation,
        color,
        strokeWidth,
        opacity,
        isShared: false,
      };
      onAnnotationAdd(shapeAnnotation);
    }

    setCurrentStroke([]);
    setShapeStart(null);
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: width,
          height: height,
          cursor: CURSOR_STYLES[activeTool] || 'crosshair',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {showTextInput && textInputPosition && (
        <div
          style={{
            position: 'absolute',
            left: textInputPosition.x * scale,
            top: textInputPosition.y * scale,
            zIndex: 100,
          }}
        >
          <input
            ref={textInputRef}
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleTextSubmit();
              } else if (e.key === 'Escape') {
                setShowTextInput(false);
                setTextInputValue('');
                setTextInputPosition(null);
              }
            }}
            onBlur={handleTextSubmit}
            placeholder="Typ hier..."
            style={{
              minWidth: '150px',
              padding: '8px 12px',
              fontSize: '16px',
              border: '2px solid #3b82f6',
              borderRadius: '6px',
              outline: 'none',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              color: color,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AnnotationCanvas;
