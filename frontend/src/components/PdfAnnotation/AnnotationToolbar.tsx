import React, { useState } from 'react';
import type { AnnotationToolbarProps, ToolType, ShapeType } from './types';
import { Icon, type IconName } from '../Icon';

interface ToolConfig {
  icon: IconName;
  label: string;
  description: string;
}

const TOOLS: Record<ToolType, ToolConfig> = {
  select: { icon: 'mousePointer', label: 'Selecteren', description: 'Selecteer en verplaats annotaties' },
  freehand: { icon: 'penTool', label: 'Tekenen', description: 'Vrije hand tekenen' },
  highlight: { icon: 'highlighter', label: 'Markeren', description: 'Tekst markeren' },
  text: { icon: 'type', label: 'Tekst', description: 'Tekst toevoegen' },
  stamp: { icon: 'stamp', label: 'Stempels', description: 'Muzieknotatie stempels' },
  shape: { icon: 'shapes', label: 'Vormen', description: 'Rechthoek, cirkel, lijn, pijl' },
  eraser: { icon: 'eraser', label: 'Gum', description: 'Annotaties wissen' },
};

const SHAPE_TYPES: { type: ShapeType; icon: IconName; label: string }[] = [
  { type: 'rectangle', icon: 'square', label: 'Rechthoek' },
  { type: 'circle', icon: 'circle', label: 'Cirkel' },
  { type: 'line', icon: 'line', label: 'Lijn' },
  { type: 'arrow', icon: 'arrow', label: 'Pijl' },
];

const COLORS = [
  { value: '#DC2626', name: 'Rood' },
  { value: '#EA580C', name: 'Oranje' },
  { value: '#CA8A04', name: 'Goud' },
  { value: '#16A34A', name: 'Groen' },
  { value: '#2563EB', name: 'Blauw' },
  { value: '#7C3AED', name: 'Paars' },
  { value: '#DB2777', name: 'Roze' },
  { value: '#171717', name: 'Zwart' },
  { value: '#FFFFFF', name: 'Wit' },
];

const STROKE_WIDTHS = [
  { value: 1, label: 'Dun' },
  { value: 2, label: 'Normaal' },
  { value: 4, label: 'Medium' },
  { value: 8, label: 'Dik' },
  { value: 12, label: 'Extra dik' },
];

const STAMP_CATEGORIES = [
  { id: 'dynamics', name: 'Dynamiek', icon: '🔊' },
  { id: 'tempo', name: 'Tempo', icon: '⏱️' },
  { id: 'articulation', name: 'Articulatie', icon: '🎵' },
  { id: 'navigation', name: 'Navigatie', icon: '🔄' },
  { id: 'general', name: 'Algemeen', icon: '✓' },
];

interface ToolButtonProps {
  tool: ToolType;
  config: ToolConfig;
  isActive: boolean;
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ config, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`annotation-tool-btn ${isActive ? 'active' : ''}`}
    title={config.description}
    aria-label={config.label}
    style={{
      width: '40px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      borderRadius: '8px',
      backgroundColor: isActive ? '#3b82f6' : 'transparent',
      color: isActive ? '#ffffff' : '#374151',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
  >
    <Icon name={config.icon} size={20} />
  </button>
);

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
  selectedShapeType = 'rectangle',
  onShapeTypeChange,
}) => {
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [stampCategory, setStampCategory] = useState('dynamics');

  const filteredStamps = stamps.filter(s => s.category === stampCategory);

  const handleToolClick = (tool: ToolType) => {
    onToolChange(tool);
    if (tool === 'stamp') {
      setShowStampPicker(true);
      setShowShapePicker(false);
    } else if (tool === 'shape') {
      setShowShapePicker(true);
      setShowStampPicker(false);
    } else {
      setShowStampPicker(false);
      setShowShapePicker(false);
    }
  };

  return (
    <div
      className="annotation-toolbar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        minWidth: '220px',
        maxWidth: '260px',
      }}
    >
      {/* Header */}
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#111827',
        paddingBottom: '8px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        Annotatiegereedschap
      </div>

      {/* Tool Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Gereedschap
        </span>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px',
          backgroundColor: '#f3f4f6',
          padding: '4px',
          borderRadius: '8px',
        }}>
          {(Object.entries(TOOLS) as [ToolType, ToolConfig][]).map(([tool, config]) => (
            <ToolButton
              key={tool}
              tool={tool}
              config={config}
              isActive={activeTool === tool}
              onClick={() => handleToolClick(tool)}
            />
          ))}
        </div>
      </div>

      {/* Shape Type Picker */}
      {showShapePicker && activeTool === 'shape' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vormtype
          </span>
          <div style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: '#f3f4f6',
            padding: '4px',
            borderRadius: '8px',
          }}>
            {SHAPE_TYPES.map(shape => (
              <button
                key={shape.type}
                onClick={() => onShapeTypeChange?.(shape.type)}
                title={shape.label}
                style={{
                  flex: 1,
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: selectedShapeType === shape.type ? '#3b82f6' : 'transparent',
                  color: selectedShapeType === shape.type ? '#ffffff' : '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon name={shape.icon} size={18} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color Picker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Kleur
        </span>
        <div style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          padding: '8px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}>
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => onColorChange(c.value)}
              title={c.name}
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: c.value,
                border: color === c.value ? '3px solid #3b82f6' : c.value === '#FFFFFF' ? '1px solid #d1d5db' : 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                boxShadow: color === c.value ? '0 0 0 2px #ffffff, 0 0 0 4px #3b82f6' : 'none',
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Lijndikte
          </span>
          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>
            {strokeWidth}px
          </span>
        </div>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '6px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}>
          {STROKE_WIDTHS.map(w => (
            <button
              key={w.value}
              onClick={() => onStrokeWidthChange(w.value)}
              title={w.label}
              style={{
                flex: 1,
                height: '32px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: strokeWidth === w.value ? '#3b82f6' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                width: `${Math.min(w.value * 2, 16)}px`,
                height: `${Math.min(w.value * 2, 16)}px`,
                backgroundColor: strokeWidth === w.value ? '#ffffff' : color,
                borderRadius: '50%',
              }} />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Dekking
          </span>
          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            appearance: 'none',
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${opacity * 100}%, #e5e7eb ${opacity * 100}%, #e5e7eb 100%)`,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Undo/Redo/Clear */}
      <div style={{
        display: 'flex',
        gap: '6px',
        paddingTop: '12px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Ongedaan maken (Ctrl+Z)"
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: canUndo ? '#f3f4f6' : '#f9fafb',
            color: canUndo ? '#374151' : '#9ca3af',
            cursor: canUndo ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Opnieuw (Ctrl+Y)"
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: canRedo ? '#f3f4f6' : '#f9fafb',
            color: canRedo ? '#374151' : '#9ca3af',
            cursor: canRedo ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
        >
          <Icon name="redo" size={16} />
        </button>
        <button
          onClick={() => {
            if (confirm('Alle annotaties op deze pagina wissen?')) {
              onClear();
            }
          }}
          title="Alles wissen"
          style={{
            padding: '10px 14px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>

      {/* Stamp Picker */}
      {showStampPicker && activeTool === 'stamp' && (
        <div style={{
          paddingTop: '12px',
          borderTop: '1px solid #e5e7eb',
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'block',
            marginBottom: '8px',
          }}>
            Stempels
          </span>

          {/* Category tabs */}
          <div style={{
            display: 'flex',
            gap: '2px',
            marginBottom: '12px',
            backgroundColor: '#f3f4f6',
            padding: '3px',
            borderRadius: '8px',
            overflowX: 'auto',
          }}>
            {STAMP_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setStampCategory(cat.id)}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: stampCategory === cat.id ? '#ffffff' : 'transparent',
                  color: stampCategory === cat.id ? '#111827' : '#6b7280',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: stampCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Stamps grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '6px',
            maxHeight: '160px',
            overflowY: 'auto',
            padding: '4px',
          }}>
            {filteredStamps.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '12px',
                padding: '16px',
              }}>
                Geen stempels in deze categorie
              </div>
            ) : (
              filteredStamps.map(stamp => (
                <button
                  key={stamp.id}
                  onClick={() => onStampSelect(stamp.id)}
                  title={stamp.name}
                  style={{
                    width: '40px',
                    height: '40px',
                    border: selectedStamp === stamp.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: selectedStamp === stamp.id ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 30 30"
                    style={{ color }}
                    dangerouslySetInnerHTML={{ __html: stamp.svgData }}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationToolbar;
