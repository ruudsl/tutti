export type AnnotationType = 'freehand' | 'highlight' | 'text' | 'stamp' | 'shape';
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';
export type ToolType = AnnotationType | 'eraser' | 'select';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  opacity: number;
}

export interface TextAnnotation {
  position: Point;
  content: string;
  fontSize: number;
  color: string;
}

export interface StampAnnotation {
  position: Point;
  stampId: string;
  scale: number;
  color: string;
  rotation: number;
}

export interface ShapeAnnotation {
  shapeType: ShapeType;
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
  filled: boolean;
}

export interface HighlightAnnotation {
  points: Point[];
  color: string;
  opacity: number;
}

export interface Annotation {
  id: string;
  musicPieceId: string;
  pageNumber: number;
  annotationType: AnnotationType;
  data: Stroke | TextAnnotation | StampAnnotation | ShapeAnnotation | HighlightAnnotation;
  color: string;
  strokeWidth: number;
  opacity: number;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Stamp {
  id: string;
  name: string;
  category: string;
  svgData: string;
  isBuiltin: boolean;
}

export interface AnnotationToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  stamps: Stamp[];
  selectedStamp: string | null;
  onStampSelect: (stampId: string) => void;
  selectedShapeType?: ShapeType;
  onShapeTypeChange?: (shapeType: ShapeType) => void;
}

export interface AnnotationCanvasProps {
  pageNumber: number;
  musicPieceId: string;
  width: number;
  height: number;
  scale: number;
  activeTool: ToolType;
  color: string;
  strokeWidth: number;
  opacity: number;
  selectedStamp: Stamp | null;
  selectedShapeType?: ShapeType;
  stamps: Stamp[];
  annotations: Annotation[];
  onAnnotationAdd: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAnnotationUpdate: (id: string, data: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
}
