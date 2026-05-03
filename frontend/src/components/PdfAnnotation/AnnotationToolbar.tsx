import React, { useState } from 'react';
import type { AnnotationToolbarProps, ToolType } from './types';

const TOOL_ICONS: Record<ToolType, string> = {
  select: '👆',
  freehand: '✏️',
  highlight: '🖍️',
  text: '📝',
  stamp: '🔖',
  shape: '⬜',
  eraser: '🧹',
};

const COLORS = [
  '#FF0000', // Red
  '#FF6600', // Orange
  '#FFCC00', // Yellow
  '#00CC00', // Green
  '#0066FF', // Blue
  '#9900FF', // Purple
  '#FF00FF', // Magenta
  '#000000', // Black
  '#FFFFFF', // White
];

const STROKE_WIDTHS = [1, 2, 4, 8, 12];

const STAMP_CATEGORIES = [
  { id: 'dynamics', name: 'Dynamiek' },
  { id: 'tempo', name: 'Tempo' },
  { id: 'articulation', name: 'Articulatie' },
  { id: 'accidentals', name: 'Voortekens' },
  { id: 'navigation', name: 'Navigatie' },
  { id: 'general', name: 'Algemeen' },
];

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeTool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  opacity,
  onOpacityChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  stamps,
  selectedStamp,
  onStampSelect,
}) => {
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [stampCategory, setStampCategory] = useState('dynamics');

  const filteredStamps = stamps.filter(s => s.category === stampCategory);

  return (
    <div className="annotation-toolbar" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      {/* Tool Selection */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(Object.keys(TOOL_ICONS) as ToolType[]).map(tool => (
          <button
            key={tool}
            onClick={() => {
              onToolChange(tool);
              if (tool === 'stamp') setShowStampPicker(true);
            }}
            title={tool}
            style={{
              width: '36px',
              height: '36px',
              fontSize: '18px',
              border: activeTool === tool ? '2px solid #3b82f6' : '1px solid #ddd',
              borderRadius: '6px',
              backgroundColor: activeTool === tool ? '#e0e7ff' : '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {TOOL_ICONS[tool]}
          </button>
        ))}
      </div>

      {/* Color Picker */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: c,
              border: color === c ? '3px solid #3b82f6' : '1px solid #ddd',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      {/* Stroke Width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>Dikte:</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => onStrokeWidthChange(w)}
              style={{
                width: '28px',
                height: '28px',
                border: strokeWidth === w ? '2px solid #3b82f6' : '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: strokeWidth === w ? '#e0e7ff' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{
                width: `${Math.min(w * 2, 20)}px`,
                height: `${Math.min(w * 2, 20)}px`,
                backgroundColor: color,
                borderRadius: '50%',
              }} />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>Dekking:</span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '12px', color: '#666', width: '30px' }}>
          {Math.round(opacity * 100)}%
        </span>
      </div>

      {/* Undo/Redo/Clear */}
      <div style={{ display: 'flex', gap: '4px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            flex: 1,
            padding: '6px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: canUndo ? '#fff' : '#f0f0f0',
            cursor: canUndo ? 'pointer' : 'not-allowed',
            opacity: canUndo ? 1 : 0.5,
          }}
        >
          ↶ Ongedaan
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{
            flex: 1,
            padding: '6px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: canRedo ? '#fff' : '#f0f0f0',
            cursor: canRedo ? 'pointer' : 'not-allowed',
            opacity: canRedo ? 1 : 0.5,
          }}
        >
          ↷ Opnieuw
        </button>
        <button
          onClick={() => {
            if (confirm('Alle annotaties op deze pagina wissen?')) {
              onClear();
            }
          }}
          style={{
            padding: '6px 12px',
            border: '1px solid #dc2626',
            borderRadius: '4px',
            backgroundColor: '#fff',
            color: '#dc2626',
            cursor: 'pointer',
          }}
        >
          🗑️
        </button>
      </div>

      {/* Stamp Picker */}
      {showStampPicker && activeTool === 'stamp' && (
        <div style={{
          borderTop: '1px solid #ddd',
          paddingTop: '8px',
        }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {STAMP_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setStampCategory(cat.id)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  border: stampCategory === cat.id ? '2px solid #3b82f6' : '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: stampCategory === cat.id ? '#e0e7ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '4px',
            maxHeight: '120px',
            overflowY: 'auto',
          }}>
            {filteredStamps.map(stamp => (
              <button
                key={stamp.id}
                onClick={() => onStampSelect(stamp.id)}
                title={stamp.name}
                style={{
                  width: '36px',
                  height: '36px',
                  border: selectedStamp === stamp.id ? '2px solid #3b82f6' : '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: selectedStamp === stamp.id ? '#e0e7ff' : '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 30 30"
                  style={{ color }}
                  dangerouslySetInnerHTML={{ __html: stamp.svgData }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationToolbar;
