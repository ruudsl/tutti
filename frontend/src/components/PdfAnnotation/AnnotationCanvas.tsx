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

export const AnnotationCanvas: React.FC<
  AnnotationCanvasProps & {
    selectedShapeType?: ShapeType;
  }
> = ({
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
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent | React.PointerEvent): Point => {
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
    },
    [scale],
  );

  const drawStampOnCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, stampData: StampAnnotation, stampColor: string, s: number) => {
      const stamp = stamps.find((st) => st.id === stampData.stampId);
      if (!stamp) return;

      ctx.save();
      ctx.translate(stampData.position.x * s, stampData.position.y * s);
      ctx.rotate((stampData.rotation * Math.PI) / 180);
      const stampScale = (stampData.scale * s) / dpr;

      ctx.fillStyle = stampColor;
      ctx.strokeStyle = stampColor;
      ctx.font = `bold ${20 * stampScale}px "Times New Roman", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const svgData = stamp.svgData;

      // Parse and draw common stamp types
      if (svgData.includes('<text')) {
        const textMatch = svgData.match(/>([^<]+)</);
        if (textMatch) {
          const text = textMatch[1];
          const fontSizeMatch = svgData.match(/font-size="(\d+)"/);
          const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) * stampScale : 20 * stampScale;
          const isItalic = svgData.includes('font-style="italic"');
          const isBold = svgData.includes('font-weight="bold"');
          ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSize}px "Times New Roman", serif`;
          ctx.fillText(text, 0, 0);
        }
      } else if (svgData.includes('<path') || svgData.includes('<line') || svgData.includes('<circle')) {
        // Draw shape-based stamps
        ctx.lineWidth = 2 * stampScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Parse path commands
        const pathMatch = svgData.match(/d="([^"]+)"/);
        if (pathMatch) {
          const pathData = pathMatch[1];
          const path = new Path2D();

          // Simple path parser
          const commands = pathData.match(/[MLQCZHVA][^MLQCZHVA]*/gi) || [];
          let currentX = 0,
            currentY = 0;

          commands.forEach((cmd) => {
            const type = cmd[0].toUpperCase();
            const nums = cmd
              .slice(1)
              .trim()
              .split(/[\s,]+/)
              .map(Number)
              .filter((n) => !isNaN(n));

            switch (type) {
              case 'M':
                currentX = (nums[0] - 15) * stampScale;
                currentY = (nums[1] - 15) * stampScale;
                path.moveTo(currentX, currentY);
                break;
              case 'L':
                currentX = (nums[0] - 15) * stampScale;
                currentY = (nums[1] - 15) * stampScale;
                path.lineTo(currentX, currentY);
                break;
              case 'C':
                path.bezierCurveTo(
                  (nums[0] - 15) * stampScale,
                  (nums[1] - 15) * stampScale,
                  (nums[2] - 15) * stampScale,
                  (nums[3] - 15) * stampScale,
                  (nums[4] - 15) * stampScale,
                  (nums[5] - 15) * stampScale,
                );
                currentX = (nums[4] - 15) * stampScale;
                currentY = (nums[5] - 15) * stampScale;
                break;
              case 'Z':
                path.closePath();
                break;
            }
          });

          if (svgData.includes('fill="currentColor"') || svgData.includes('fill="none"') === false) {
            ctx.fill(path);
          }
          if (svgData.includes('stroke="currentColor"') || svgData.includes('stroke=')) {
            ctx.stroke(path);
          }
        }

        // Draw circles
        const circleMatches = svgData.matchAll(/cx="([\d.]+)"\s*cy="([\d.]+)"\s*r="([\d.]+)"/g);
        for (const match of circleMatches) {
          const cx = (parseFloat(match[1]) - 15) * stampScale;
          const cy = (parseFloat(match[2]) - 15) * stampScale;
          const r = parseFloat(match[3]) * stampScale;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (svgData.includes('fill="none"')) {
            ctx.stroke();
          } else {
            ctx.fill();
          }
        }

        // Draw lines
        const lineMatches = svgData.matchAll(/x1="([\d.]+)"\s*y1="([\d.]+)"\s*x2="([\d.]+)"\s*y2="([\d.]+)"/g);
        for (const match of lineMatches) {
          ctx.beginPath();
          ctx.moveTo((parseFloat(match[1]) - 15) * stampScale, (parseFloat(match[2]) - 15) * stampScale);
          ctx.lineTo((parseFloat(match[3]) - 15) * stampScale, (parseFloat(match[4]) - 15) * stampScale);
          ctx.stroke();
        }
      }

      ctx.restore();
    },
    [stamps, dpr],
  );

  const drawAnnotation = useCallback(
    (ctx: CanvasRenderingContext2D, annotation: Annotation, dpr: number) => {
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
          const stampData = annotation.data as StampAnnotation;
          drawStampOnCanvas(ctx, stampData, annotation.color, s);
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
              const headLength = (15 * s) / dpr;
              ctx.lineTo(
                x2 - headLength * Math.cos(angle - Math.PI / 6),
                y2 - headLength * Math.sin(angle - Math.PI / 6),
              );
              ctx.moveTo(x2, y2);
              ctx.lineTo(
                x2 - headLength * Math.cos(angle + Math.PI / 6),
                y2 - headLength * Math.sin(angle + Math.PI / 6),
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
    },
    [scale, drawStampOnCanvas],
  );

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
              const headLength = (15 * s) / dpr;
              ctx.lineTo(
                x2 - headLength * Math.cos(angle - Math.PI / 6),
                y2 - headLength * Math.sin(angle - Math.PI / 6),
              );
              ctx.moveTo(x2, y2);
              ctx.lineTo(
                x2 - headLength * Math.cos(angle + Math.PI / 6),
                y2 - headLength * Math.sin(angle + Math.PI / 6),
              );
            }
            break;
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, [
    annotations,
    isDrawing,
    currentStroke,
    shapeStart,
    activeTool,
    selectedShapeType,
    color,
    strokeWidth,
    opacity,
    scale,
    dpr,
    drawAnnotation,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width * scale * dpr;
    canvas.height = height * scale * dpr;

    redraw();
  }, [width, height, scale, dpr, redraw]);

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
    setCurrentStroke((prev) => [...prev, point]);
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
                Math.pow(strokePoint.x - erasePoint.x, 2) + Math.pow(strokePoint.y - erasePoint.y, 2),
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

      toDelete.forEach((id) => onAnnotationDelete(id));
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

  // De laag ligt over de bladzijde zoals die op het scherm staat, en die is
  // `width * scale` bij `height * scale` groot (zie PdfAnnotation/index.tsx).
  // Stond hier de ongeschaalde maat, dan bedekte de laag bij zoom 2 nog maar
  // een kwart van de bladzijde en verscheen alles wat je tekende op de halve
  // afstand van de linkerbovenhoek. Doekpunten zijn en blijven ongeschaald;
  // het invoerveld voor tekst hieronder rekent ze met dezelfde `* scale` om.
  const displayWidth = width * scale;
  const displayHeight = height * scale;

  return (
    <div style={{ position: 'relative', width: displayWidth, height: displayHeight }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: displayWidth,
          height: displayHeight,
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
