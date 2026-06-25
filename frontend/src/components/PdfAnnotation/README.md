# PDF Annotation System

The PDF Annotation system allows users to add annotations, markings, and stamps to sheet music PDFs within Harmonie.

## Overview

This system provides a rich set of tools for musicians to annotate their sheet music, including:

- Freehand drawing for personal markings
- Highlighting for important passages
- Text annotations for notes and reminders
- Musical stamps (dynamics, tempo, articulation, navigation marks)
- Geometric shapes (rectangles, circles, lines, arrows)
- Eraser tool for corrections
- Undo/redo support

## Components

### PdfAnnotator (`index.tsx`)

The main component that orchestrates the annotation experience.

**Props:**
```tsx
interface PdfAnnotatorProps {
  musicPieceId: string;    // ID of the music piece being annotated
  pageNumber: number;      // Current page number
  pageWidth: number;       // Width of the PDF page
  pageHeight: number;      // Height of the PDF page
  scale: number;           // Current zoom scale
  onClose?: () => void;    // Optional close callback
}
```

**Features:**
- Manages annotation state (add, update, delete)
- Handles undo/redo stacks
- Loads and saves annotations (online and offline)
- Provides a floating toolbar interface
- Includes built-in musical stamps

### AnnotationCanvas (`AnnotationCanvas.tsx`)

The drawing canvas that renders annotations and handles user input.

**Responsibilities:**
- Renders all existing annotations
- Handles pointer/touch events for drawing
- Supports high-DPI displays
- Manages active drawing state
- Text input for text annotations

**Supported Operations:**
- Freehand drawing with smooth bezier curves
- Shape drawing (preview while drawing)
- Stamp placement on click
- Text input at click position
- Eraser that detects collisions with strokes

### AnnotationToolbar (`AnnotationToolbar.tsx`)

The user interface for selecting tools and options.

**Features:**
- Tool selection (select, freehand, highlight, text, stamp, shape, eraser)
- Color picker with preset colors
- Stroke width selection
- Opacity slider
- Shape type picker (rectangle, circle, line, arrow)
- Stamp picker with categories and search
- Undo/redo/clear buttons
- Keyboard shortcuts (1-7 for tools, Ctrl+Z/Y for undo/redo)
- Dark mode support

### Types (`types.ts`)

TypeScript definitions for all annotation-related types.

**Key Types:**
```tsx
type AnnotationType = 'freehand' | 'highlight' | 'text' | 'stamp' | 'shape';
type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';
type ToolType = AnnotationType | 'eraser' | 'select';

interface Annotation {
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
```

## Usage

### Basic Usage

```tsx
import { PdfAnnotator } from '../components/PdfAnnotation';

function MusicViewer() {
  return (
    <div style={{ position: 'relative' }}>
      <PdfPage />
      <PdfAnnotator
        musicPieceId="piece-123"
        pageNumber={1}
        pageWidth={595}
        pageHeight={842}
        scale={1.5}
      />
    </div>
  );
}
```

### With Custom Stamps

The system includes many built-in stamps organized by category:

- **Dynamics**: fff, ff, f, mf, mp, p, pp, ppp, sfz, fp, cresc., decresc., crescendo hairpin, decrescendo hairpin
- **Tempo**: rit., ritard., rall., accel., a tempo, rubato, fermata, breath mark, caesura
- **Articulation**: staccato, accent, marcato, tenuto, trill, mordent, turn, portato
- **Navigation**: coda, segno, repeat, D.C., D.S., Fine
- **General**: check mark, cross, star, question mark, exclamation, circle, arrows, heart, plus

Custom stamps can be loaded from the server via the `/annotations/stamps` endpoint.

## Data Persistence

Annotations are persisted in two ways:

1. **Online**: Saved to the backend via `/annotations/{musicPieceId}/{pageNumber}` API
2. **Offline**: Saved to IndexedDB via `offlineDb.ts` for offline-first support

The component automatically syncs between online and offline storage.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Select tool |
| 2 | Freehand drawing |
| 3 | Highlighter |
| 4 | Text annotation |
| 5 | Stamp tool |
| 6 | Shape tool |
| 7 | Eraser |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |

## Styling

The toolbar and canvas adapt to dark mode using CSS custom properties and the `useDarkMode` hook.

The toolbar uses inline styles for positioning and appearance, making it easy to customize.

## Exports

```tsx
// Main component
export { PdfAnnotator } from './index';

// Sub-components
export { AnnotationCanvas } from './AnnotationCanvas';
export { AnnotationToolbar } from './AnnotationToolbar';

// Types
export * from './types';
```
