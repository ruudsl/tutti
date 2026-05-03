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
} from './types';

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
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
  annotations,
  onAnnotationAdd,
  onAnnotationUpdate: _onAnnotationUpdate,
  onAnnotationDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    ctx.save();
    ctx.globalAlpha = annotation.opacity;

    switch (annotation.annotationType) {
      case 'freehand': {
        const stroke = annotation.data as Stroke;
        if (stroke.points.length < 2) break;

        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.strokeWidth * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);

        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1];
          const p1 = stroke.points[i];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x * scale, p0.y * scale, midX * scale, midY * scale);
        }

        const lastPoint = stroke.points[stroke.points.length - 1];
        ctx.lineTo(lastPoint.x * scale, lastPoint.y * scale);
        ctx.stroke();
        break;
      }

      case 'highlight': {
        const highlight = annotation.data as HighlightAnnotation;
        if (highlight.points.length < 2) break;

        ctx.fillStyle = annotation.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(highlight.points[0].x * scale, highlight.points[0].y * scale);

        for (const point of highlight.points) {
          ctx.lineTo(point.x * scale, point.y * scale);
        }

        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'text': {
        const text = annotation.data as TextAnnotation;
        ctx.fillStyle = annotation.color;
        ctx.font = `${text.fontSize * scale}px sans-serif`;
        ctx.fillText(text.content, text.position.x * scale, text.position.y * scale);
        break;
      }

      case 'stamp': {
        const stamp = annotation.data as StampAnnotation;
        if (!selectedStamp) break;

        ctx.translate(stamp.position.x * scale, stamp.position.y * scale);
        ctx.rotate((stamp.rotation * Math.PI) / 180);
        ctx.scale(stamp.scale, stamp.scale);
        ctx.fillStyle = annotation.color;

        // Create an SVG image and draw it
        const img = new Image();
        const svgBlob = new Blob(
          [`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">${selectedStamp.svgData}</svg>`],
          { type: 'image/svg+xml' }
        );
        img.src = URL.createObjectURL(svgBlob);
        ctx.drawImage(img, -15, -15, 30, 30);
        break;
      }

      case 'shape': {
        const shape = annotation.data as ShapeAnnotation;
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.strokeWidth * scale;

        const x1 = shape.start.x * scale;
        const y1 = shape.start.y * scale;
        const x2 = shape.end.x * scale;
        const y2 = shape.end.y * scale;

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
          case 'arrow':
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            // Draw arrowhead
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = 15 * scale;
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

        if (shape.filled) {
          ctx.fillStyle = annotation.color;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }, [scale, selectedStamp]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all saved annotations
    for (const annotation of annotations) {
      drawAnnotation(ctx, annotation);
    }

    // Draw current stroke if drawing
    if (isDrawing && currentStroke.length > 0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x * scale, currentStroke[0].y * scale);

      for (let i = 1; i < currentStroke.length; i++) {
        const p0 = currentStroke[i - 1];
        const p1 = currentStroke[i];
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x * scale, p0.y * scale, midX * scale, midY * scale);
      }

      const lastPoint = currentStroke[currentStroke.length - 1];
      ctx.lineTo(lastPoint.x * scale, lastPoint.y * scale);
      ctx.stroke();
      ctx.restore();
    }

    // Draw shape preview if shape tool is active
    if (shapeStart && isDrawing && activeTool === 'shape') {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth * scale;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      // Preview rectangle for now
      const lastPoint = currentStroke[currentStroke.length - 1] || shapeStart;
      ctx.rect(
        shapeStart.x * scale,
        shapeStart.y * scale,
        (lastPoint.x - shapeStart.x) * scale,
        (lastPoint.y - shapeStart.y) * scale
      );
      ctx.stroke();
      ctx.restore();
    }
  }, [annotations, isDrawing, currentStroke, shapeStart, activeTool, color, strokeWidth, opacity, scale, drawAnnotation]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'select') return;

    const point = getCanvasPoint(e);
    setIsDrawing(true);

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
      setIsDrawing(false);
      return;
    }

    if (activeTool === 'text') {
      const text = prompt('Voer tekst in:');
      if (text) {
        const textAnnotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
          musicPieceId,
          pageNumber,
          annotationType: 'text',
          data: {
            position: point,
            content: text,
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
      setIsDrawing(false);
      return;
    }

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
      // Find annotations that intersect with the eraser stroke
      // For simplicity, we'll check if any point is near the stroke
      const eraserRadius = strokeWidth * 2;
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
                onAnnotationDelete(annotation.id);
                break;
              }
            }
          }
        }
      }
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
          shapeType: 'rectangle', // Default to rectangle, could be configurable
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
    <canvas
      ref={canvasRef}
      width={width * scale}
      height={height * scale}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: width,
        height: height,
        cursor: activeTool === 'eraser' ? 'crosshair' : activeTool === 'select' ? 'default' : 'crosshair',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
};

export default AnnotationCanvas;
