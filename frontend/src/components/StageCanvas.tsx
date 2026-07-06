import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StagePosition, StageShape, StageLayoutData, StagePositionType, StageShapeType } from '../types';

interface StageCanvasProps {
  width: number;
  height: number;
  layoutData: StageLayoutData;
  selectedIds: string[];
  tool: 'select' | 'chair' | 'stand' | 'conductor' | 'piano' | 'percussion' | 'rect' | 'circle' | 'text';
  gridSnap: boolean;
  zoom: number;
  currentSection?: string;
  readOnly?: boolean;
  onLayoutChange: (data: StageLayoutData) => void;
  onSelectionChange: (ids: string[]) => void;
}

const GRID_SIZE = 20;

// Position type colors
const POSITION_COLORS: Record<StagePositionType, string> = {
  chair: '#4CAF50',
  stand: '#2196F3',
  conductor: '#9C27B0',
  piano: '#795548',
  percussion: '#FF9800',
  other: '#607D8B',
};

// Position type shapes/icons
const POSITION_SIZE = 30;
const CONDUCTOR_SIZE = 40;

export default function StageCanvas({
  width,
  height,
  layoutData,
  selectedIds,
  tool,
  gridSnap,
  zoom,
  currentSection,
  readOnly = false,
  onLayoutChange,
  onSelectionChange,
}: StageCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate grid-snapped position
  const snapToGrid = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      if (!gridSnap) return { x, y };
      return {
        x: Math.round(x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(y / GRID_SIZE) * GRID_SIZE,
      };
    },
    [gridSnap],
  );

  // Convert screen coordinates to SVG coordinates
  const screenToSvg = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  // Generate unique ID
  const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add new element based on current tool
  const addElement = useCallback(
    (x: number, y: number) => {
      const newLayoutData = { ...layoutData };

      if (['chair', 'stand', 'conductor', 'piano', 'percussion'].includes(tool)) {
        const newPosition: StagePosition = {
          id: generateId(),
          x,
          y,
          type: tool as StagePositionType,
          rotation: 0,
          section: currentSection,
        };
        newLayoutData.positions = [...newLayoutData.positions, newPosition];
        onLayoutChange(newLayoutData);
        onSelectionChange([newPosition.id]);
      } else if (['rect', 'circle', 'text'].includes(tool)) {
        const newShape: StageShape = {
          id: generateId(),
          type: tool as StageShapeType,
          x,
          y,
          width: tool === 'rect' ? 100 : undefined,
          height: tool === 'rect' ? 60 : undefined,
          radius: tool === 'circle' ? 50 : undefined,
          fill: '#e0e0e0',
          stroke: '#999999',
          fontSize: tool === 'text' ? 16 : undefined,
          label: tool === 'text' ? 'Label' : undefined,
        };
        newLayoutData.shapes = [...newLayoutData.shapes, newShape];
        onLayoutChange(newLayoutData);
        onSelectionChange([newShape.id]);
      }
    },
    [layoutData, tool, currentSection, onLayoutChange, onSelectionChange],
  );

  // Handle canvas click (add new element or deselect)
  // Uses capture phase (onClickCapture) so it fires before child elements
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (readOnly || isDragging) return;

      // When using a placement tool, ALWAYS add element regardless of what was clicked
      if (tool !== 'select') {
        e.stopPropagation(); // Prevent element selection
        const pos = screenToSvg(e.clientX, e.clientY);
        const snapped = snapToGrid(pos.x, pos.y);
        addElement(snapped.x, snapped.y);
        return;
      }

      // In select mode, clicking background deselects (handled by normal event flow)
      const target = e.target as SVGElement;
      const isBackground = target === svgRef.current || target.classList.contains('stage-background');
      if (isBackground) {
        onSelectionChange([]);
      }
    },
    [readOnly, isDragging, tool, screenToSvg, snapToGrid, onSelectionChange, addElement],
  );

  // Handle element click (select only - placement is handled by canvas click)
  const handleElementClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (readOnly) return;

      // When not in select mode, let the click bubble to canvas for placement
      if (tool !== 'select') {
        return; // Don't stop propagation - let canvas handle it
      }

      e.stopPropagation();

      if (e.shiftKey) {
        // Multi-select
        if (selectedIds.includes(id)) {
          onSelectionChange(selectedIds.filter((sid) => sid !== id));
        } else {
          onSelectionChange([...selectedIds, id]);
        }
      } else {
        onSelectionChange([id]);
      }
    },
    [readOnly, tool, selectedIds, onSelectionChange],
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent, id: string) => {
      // Only allow dragging in select mode
      if (readOnly || tool !== 'select') return;

      e.stopPropagation();

      if (!selectedIds.includes(id)) {
        onSelectionChange([id]);
      }

      const pos = screenToSvg(e.clientX, e.clientY);
      setDragStart(pos);
      setIsDragging(true);
    },
    [readOnly, tool, selectedIds, screenToSvg, onSelectionChange],
  );

  // Move a single element by a delta (used for keyboard-based dragging)
  const moveElementBy = useCallback(
    (id: string, dx: number, dy: number) => {
      const newLayoutData = {
        ...layoutData,
        positions: layoutData.positions.map((pos) => (pos.id === id ? { ...pos, x: pos.x + dx, y: pos.y + dy } : pos)),
        shapes: layoutData.shapes.map((shape) =>
          shape.id === id ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape,
        ),
      };
      onLayoutChange(newLayoutData);
    },
    [layoutData, onLayoutChange],
  );

  // Keyboard support on individual elements: arrow keys move the focused
  // element, Enter/Space selects (grabs) or deselects (releases) it.
  const handleElementKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (readOnly) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        // Prevent the window-level handler from moving the selection as well
        e.stopPropagation();
        const delta = gridSnap ? GRID_SIZE : 5;
        const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
        const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
        if (!selectedIds.includes(id)) {
          onSelectionChange([id]);
        }
        moveElementBy(id, dx, dy);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onSelectionChange(selectedIds.includes(id) ? [] : [id]);
      }
    },
    [readOnly, gridSnap, selectedIds, onSelectionChange, moveElementBy],
  );

  // Handle mouse move (dragging)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStart || readOnly) return;

      const pos = screenToSvg(e.clientX, e.clientY);
      setDragOffset({
        x: pos.x - dragStart.x,
        y: pos.y - dragStart.y,
      });
    },
    [isDragging, dragStart, readOnly, screenToSvg],
  );

  // Handle mouse up (end drag)
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    if (dragOffset.x !== 0 || dragOffset.y !== 0) {
      // Apply the drag offset to selected elements
      const newLayoutData = { ...layoutData };

      newLayoutData.positions = layoutData.positions.map((pos) => {
        if (selectedIds.includes(pos.id)) {
          const snapped = snapToGrid(pos.x + dragOffset.x, pos.y + dragOffset.y);
          return { ...pos, x: snapped.x, y: snapped.y };
        }
        return pos;
      });

      newLayoutData.shapes = layoutData.shapes.map((shape) => {
        if (selectedIds.includes(shape.id)) {
          const snapped = snapToGrid(shape.x + dragOffset.x, shape.y + dragOffset.y);
          return { ...shape, x: snapped.x, y: snapped.y };
        }
        return shape;
      });

      onLayoutChange(newLayoutData);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
  }, [isDragging, dragOffset, layoutData, selectedIds, snapToGrid, onLayoutChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;

      // Delete selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          const newLayoutData = {
            ...layoutData,
            positions: layoutData.positions.filter((p) => !selectedIds.includes(p.id)),
            shapes: layoutData.shapes.filter((s) => !selectedIds.includes(s.id)),
          };
          onLayoutChange(newLayoutData);
          onSelectionChange([]);
        }
      }

      // Move with arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const delta = gridSnap ? GRID_SIZE : 5;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowUp') dy = -delta;
          if (e.key === 'ArrowDown') dy = delta;
          if (e.key === 'ArrowLeft') dx = -delta;
          if (e.key === 'ArrowRight') dx = delta;

          const newLayoutData = {
            ...layoutData,
            positions: layoutData.positions.map((pos) =>
              selectedIds.includes(pos.id) ? { ...pos, x: pos.x + dx, y: pos.y + dy } : pos,
            ),
            shapes: layoutData.shapes.map((shape) =>
              selectedIds.includes(shape.id) ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape,
            ),
          };
          onLayoutChange(newLayoutData);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, selectedIds, layoutData, gridSnap, onLayoutChange, onSelectionChange]);

  // Get section color
  const getSectionColor = (sectionId?: string): string => {
    if (!sectionId) return '#cccccc';
    const section = layoutData.sections.find((s) => s.id === sectionId);
    return section?.color || '#cccccc';
  };

  // Render position element
  const renderPosition = (pos: StagePosition) => {
    const isSelected = selectedIds.includes(pos.id);
    const size = pos.type === 'conductor' ? CONDUCTOR_SIZE : POSITION_SIZE;
    const color = POSITION_COLORS[pos.type] || POSITION_COLORS.other;
    const sectionColor = getSectionColor(pos.section);

    // Calculate position with drag offset if dragging
    const x = isSelected && isDragging ? snapToGrid(pos.x + dragOffset.x, pos.y + dragOffset.y).x : pos.x;
    const y = isSelected && isDragging ? snapToGrid(pos.x + dragOffset.x, pos.y + dragOffset.y).y : pos.y;

    return (
      <g
        key={pos.id}
        transform={`translate(${x}, ${y}) rotate(${pos.rotation || 0})`}
        style={{ cursor: readOnly ? 'default' : 'move' }}
        onClick={(e) => handleElementClick(e, pos.id)}
        onMouseDown={(e) => handleDragStart(e, pos.id)}
        tabIndex={readOnly ? -1 : 0}
        role="button"
        aria-label={pos.label || t(`stageDesigner.tools.${pos.type}`, pos.type)}
        onKeyDown={(e) => handleElementKeyDown(e, pos.id)}
      >
        {/* Chair/Stand shape */}
        {pos.type === 'chair' && (
          <>
            <rect
              x={-size / 2}
              y={-size / 2}
              width={size}
              height={size}
              rx={4}
              fill={sectionColor}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
            <circle cx={0} cy={-size / 4} r={size / 6} fill="#333" />
          </>
        )}

        {pos.type === 'stand' && (
          <>
            <rect
              x={-size / 2}
              y={-size / 2}
              width={size}
              height={size}
              rx={4}
              fill={sectionColor}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
            <line x1={-size / 3} y1={0} x2={size / 3} y2={0} stroke="#333" strokeWidth={2} />
            <line x1={0} y1={-size / 3} x2={0} y2={size / 3} stroke="#333" strokeWidth={2} />
          </>
        )}

        {pos.type === 'conductor' && (
          <>
            <polygon
              points={`0,${-size / 2} ${size / 2},${size / 2} ${-size / 2},${size / 2}`}
              fill={color}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
          </>
        )}

        {pos.type === 'piano' && (
          <>
            <rect
              x={-size}
              y={-size / 2}
              width={size * 2}
              height={size}
              rx={4}
              fill={color}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
            <rect x={-size + 5} y={-size / 2 + 5} width={size * 2 - 10} height={size / 3} fill="#111" />
          </>
        )}

        {pos.type === 'percussion' && (
          <>
            <circle
              cx={0}
              cy={0}
              r={size / 2}
              fill={color}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
          </>
        )}

        {pos.type === 'other' && (
          <>
            <rect
              x={-size / 2}
              y={-size / 2}
              width={size}
              height={size}
              fill={color}
              stroke={isSelected ? '#1976D2' : '#333'}
              strokeWidth={isSelected ? 3 : 1}
            />
          </>
        )}

        {/* Label */}
        {pos.label && (
          <text x={0} y={size / 2 + 14} textAnchor="middle" fontSize={11} fill="#333" fontWeight="bold">
            {pos.label}
          </text>
        )}
      </g>
    );
  };

  // Render shape element
  const renderShape = (shape: StageShape) => {
    const isSelected = selectedIds.includes(shape.id);

    // Calculate position with drag offset if dragging
    const x = isSelected && isDragging ? snapToGrid(shape.x + dragOffset.x, shape.y + dragOffset.y).x : shape.x;
    const y = isSelected && isDragging ? snapToGrid(shape.x + dragOffset.x, shape.y + dragOffset.y).y : shape.y;

    const strokeWidth = isSelected ? 3 : 1;
    const stroke = isSelected ? '#1976D2' : shape.stroke || '#999';

    return (
      <g
        key={shape.id}
        style={{ cursor: readOnly ? 'default' : 'move' }}
        onClick={(e) => handleElementClick(e, shape.id)}
        onMouseDown={(e) => handleDragStart(e, shape.id)}
        tabIndex={readOnly ? -1 : 0}
        role="button"
        aria-label={shape.label || t(`stageDesigner.tools.${shape.type}`, shape.type)}
        onKeyDown={(e) => handleElementKeyDown(e, shape.id)}
      >
        {shape.type === 'rect' && (
          <>
            <rect
              x={x}
              y={y}
              width={shape.width || 100}
              height={shape.height || 60}
              fill={shape.fill || '#e0e0e0'}
              stroke={stroke}
              strokeWidth={strokeWidth}
              rx={4}
            />
            {shape.label && (
              <text
                x={x + (shape.width || 100) / 2}
                y={y + (shape.height || 60) / 2 + 5}
                textAnchor="middle"
                fontSize={14}
                fill="#333"
              >
                {shape.label}
              </text>
            )}
          </>
        )}

        {shape.type === 'circle' && (
          <>
            <circle
              cx={x}
              cy={y}
              r={shape.radius || 50}
              fill={shape.fill || '#e0e0e0'}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            {shape.label && (
              <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fill="#333">
                {shape.label}
              </text>
            )}
          </>
        )}

        {shape.type === 'text' && (
          <text
            x={x}
            y={y}
            fontSize={shape.fontSize || 16}
            fill={shape.fill || '#333'}
            style={{
              cursor: readOnly ? 'default' : 'move',
              userSelect: 'none',
            }}
          >
            {isSelected && (
              <tspan
                style={{
                  stroke: '#1976D2',
                  strokeWidth: 0.5,
                  paintOrder: 'stroke',
                }}
              >
                {shape.label || 'Text'}
              </tspan>
            )}
            {!isSelected && (shape.label || 'Text')}
          </text>
        )}
      </g>
    );
  };

  // Render grid
  const renderGrid = () => {
    const lines = [];
    const gridColor = '#e8e8e8';

    // Vertical lines
    for (let x = 0; x <= width; x += GRID_SIZE) {
      lines.push(<line key={`v-${x}`} x1={x} y1={0} x2={x} y2={height} stroke={gridColor} strokeWidth={1} />);
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += GRID_SIZE) {
      lines.push(<line key={`h-${y}`} x1={0} y1={y} x2={width} y2={y} stroke={gridColor} strokeWidth={1} />);
    }

    return <g className="grid">{lines}</g>;
  };

  return (
    <div
      className="stage-canvas-container"
      style={{
        overflow: 'auto',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        backgroundColor: 'white',
      }}
    >
      <svg
        ref={svgRef}
        width={width * zoom}
        height={height * zoom}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: 'block',
          cursor: tool === 'select' ? (isDragging ? 'grabbing' : 'default') : 'crosshair',
        }}
        onClickCapture={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background */}
        <rect className="stage-background" x={0} y={0} width={width} height={height} fill="#f5f5f5" />

        {/* Grid */}
        {gridSnap && renderGrid()}

        {/* Stage area indicator */}
        <rect
          x={10}
          y={10}
          width={width - 20}
          height={height - 20}
          fill="none"
          stroke="#ccc"
          strokeWidth={2}
          strokeDasharray="10,5"
          rx={8}
        />

        {/* Front label */}
        <text x={width / 2} y={height - 20} textAnchor="middle" fontSize={14} fill="#666">
          {t('stageDesigner.front', 'VOORKANT (PUBLIEK)')}
        </text>

        {/* Shapes (render first, behind positions) */}
        {layoutData.shapes.map(renderShape)}

        {/* Positions */}
        {layoutData.positions.map(renderPosition)}
      </svg>
    </div>
  );
}
