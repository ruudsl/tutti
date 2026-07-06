import React, { useState, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import type { AnnotationToolbarProps, ToolType, ShapeType } from './types';
import { Icon, type IconName } from '../Icon';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Tooltip } from '../Tooltip';
import { ConfirmDialog } from '../ConfirmDialog';

interface ToolConfig {
  icon: IconName;
  labelKey: string;
  descriptionKey: string;
}

const TOOLS: Record<ToolType, ToolConfig> = {
  select: {
    icon: 'mousePointer',
    labelKey: 'annotationToolbar.tools.select',
    descriptionKey: 'annotationToolbar.tools.selectDesc',
  },
  freehand: {
    icon: 'penTool',
    labelKey: 'annotationToolbar.tools.freehand',
    descriptionKey: 'annotationToolbar.tools.freehandDesc',
  },
  highlight: {
    icon: 'highlighter',
    labelKey: 'annotationToolbar.tools.highlight',
    descriptionKey: 'annotationToolbar.tools.highlightDesc',
  },
  text: { icon: 'type', labelKey: 'annotationToolbar.tools.text', descriptionKey: 'annotationToolbar.tools.textDesc' },
  stamp: {
    icon: 'stamp',
    labelKey: 'annotationToolbar.tools.stamp',
    descriptionKey: 'annotationToolbar.tools.stampDesc',
  },
  shape: {
    icon: 'shapes',
    labelKey: 'annotationToolbar.tools.shape',
    descriptionKey: 'annotationToolbar.tools.shapeDesc',
  },
  eraser: {
    icon: 'eraser',
    labelKey: 'annotationToolbar.tools.eraser',
    descriptionKey: 'annotationToolbar.tools.eraserDesc',
  },
};

const SHAPE_TYPE_KEYS: { type: ShapeType; icon: IconName; labelKey: string }[] = [
  { type: 'rectangle', icon: 'square', labelKey: 'annotationToolbar.shapes.rectangle' },
  { type: 'circle', icon: 'circle', labelKey: 'annotationToolbar.shapes.circle' },
  { type: 'line', icon: 'line', labelKey: 'annotationToolbar.shapes.line' },
  { type: 'arrow', icon: 'arrow', labelKey: 'annotationToolbar.shapes.arrow' },
];

const COLORS_DATA = [
  { value: '#DC2626', nameKey: 'annotationToolbar.colors.red' },
  { value: '#EA580C', nameKey: 'annotationToolbar.colors.orange' },
  { value: '#CA8A04', nameKey: 'annotationToolbar.colors.gold' },
  { value: '#16A34A', nameKey: 'annotationToolbar.colors.green' },
  { value: '#2563EB', nameKey: 'annotationToolbar.colors.blue' },
  { value: '#7C3AED', nameKey: 'annotationToolbar.colors.purple' },
  { value: '#DB2777', nameKey: 'annotationToolbar.colors.pink' },
  { value: '#171717', nameKey: 'annotationToolbar.colors.black' },
  { value: '#FFFFFF', nameKey: 'annotationToolbar.colors.white' },
];

const STROKE_WIDTH_KEYS = [
  { value: 1, labelKey: 'annotationToolbar.strokeWidth.thin' },
  { value: 2, labelKey: 'annotationToolbar.strokeWidth.normal' },
  { value: 4, labelKey: 'annotationToolbar.strokeWidth.medium' },
  { value: 8, labelKey: 'annotationToolbar.strokeWidth.thick' },
  { value: 12, labelKey: 'annotationToolbar.strokeWidth.extraThick' },
];

const STAMP_CATEGORY_KEYS = [
  { id: 'dynamics', nameKey: 'annotationToolbar.stampCategories.dynamics', icon: '🔊' },
  { id: 'tempo', nameKey: 'annotationToolbar.stampCategories.tempo', icon: '⏱️' },
  { id: 'articulation', nameKey: 'annotationToolbar.stampCategories.articulation', icon: '🎵' },
  { id: 'navigation', nameKey: 'annotationToolbar.stampCategories.navigation', icon: '🔄' },
  { id: 'general', nameKey: 'annotationToolbar.stampCategories.general', icon: '✓' },
];

interface ToolButtonProps {
  tool: ToolType;
  config: ToolConfig;
  isActive: boolean;
  onClick: () => void;
  shortcut?: string;
  isDarkMode?: boolean;
  label: string;
  description: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  config,
  isActive,
  onClick,
  shortcut,
  isDarkMode,
  label,
  description,
}) => (
  <Tooltip content={`${description}${shortcut ? ` (${shortcut})` : ''}`} position="right">
    <button
      onClick={onClick}
      className={`annotation-tool-btn ${isActive ? 'active' : ''}`}
      aria-label={label}
      style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: isActive ? '#3b82f6' : 'transparent',
        color: isActive ? '#ffffff' : isDarkMode ? '#d1d5db' : '#374151',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <Icon name={config.icon} size={20} />
    </button>
  </Tooltip>
);

// Tool keyboard shortcuts mapping
const TOOL_SHORTCUTS: Record<string, ToolType> = {
  '1': 'select',
  '2': 'freehand',
  '3': 'highlight',
  '4': 'text',
  '5': 'stamp',
  '6': 'shape',
  '7': 'eraser',
};

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
  const { t } = useTranslation();
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [stampCategory, setStampCategory] = useState('dynamics');
  const [stampSearch, setStampSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { isDarkMode } = useDarkMode();

  // Keyboard shortcuts for tools
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Tool shortcuts (1-7)
      const tool = TOOL_SHORTCUTS[e.key];
      if (tool) {
        e.preventDefault();
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
      }

      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolChange, onUndo, onRedo]);

  // Filter stamps by search and category
  const filteredStamps = useMemo(() => {
    let result = stamps.filter((s) => s.category === stampCategory);
    if (stampSearch.trim()) {
      const search = stampSearch.toLowerCase();
      result = stamps.filter((s) => s.name.toLowerCase().includes(search) || s.category.toLowerCase().includes(search));
    }
    return result;
  }, [stamps, stampCategory, stampSearch]);

  // Dark mode styles
  const bgColor = isDarkMode ? '#1f2937' : '#ffffff';
  const borderColor = isDarkMode ? '#374151' : '#e5e7eb';
  const textColor = isDarkMode ? '#f3f4f6' : '#111827';
  const textLightColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const bgSecondary = isDarkMode ? '#374151' : '#f3f4f6';
  const bgTertiary = isDarkMode ? '#4b5563' : '#f9fafb';

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
        backgroundColor: bgColor,
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        border: `1px solid ${borderColor}`,
        minWidth: '220px',
        maxWidth: '260px',
        transition: 'background-color 0.2s, border-color 0.2s',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: textColor,
          paddingBottom: '8px',
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {t('annotationToolbar.title')}
      </div>

      {/* Tool Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: textLightColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {t('annotationToolbar.toolsLabel')}
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '4px',
            backgroundColor: bgSecondary,
            padding: '4px',
            borderRadius: '8px',
          }}
        >
          {(Object.entries(TOOLS) as [ToolType, ToolConfig][]).map(([tool, config], index) => (
            <ToolButton
              key={tool}
              tool={tool}
              config={config}
              isActive={activeTool === tool}
              onClick={() => handleToolClick(tool)}
              shortcut={String(index + 1)}
              isDarkMode={isDarkMode}
              label={t(config.labelKey)}
              description={t(config.descriptionKey)}
            />
          ))}
        </div>
      </div>

      {/* Shape Type Picker */}
      {showShapePicker && activeTool === 'shape' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('annotationToolbar.shapeType')}
          </span>
          <div
            style={{
              display: 'flex',
              gap: '4px',
              backgroundColor: '#f3f4f6',
              padding: '4px',
              borderRadius: '8px',
            }}
          >
            {SHAPE_TYPE_KEYS.map((shape) => (
              <button
                key={shape.type}
                onClick={() => onShapeTypeChange?.(shape.type)}
                title={t(shape.labelKey)}
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
        <span
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {t('annotationToolbar.color')}
        </span>
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            padding: '8px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          {COLORS_DATA.map((c) => (
            <button
              key={c.value}
              onClick={() => onColorChange(c.value)}
              title={t(c.nameKey)}
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
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('annotationToolbar.strokeWidthLabel')}
          </span>
          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{strokeWidth}px</span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '6px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          {STROKE_WIDTH_KEYS.map((w) => (
            <button
              key={w.value}
              onClick={() => onStrokeWidthChange(w.value)}
              title={t(w.labelKey)}
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
              <div
                style={{
                  width: `${Math.min(w.value * 2, 16)}px`,
                  height: `${Math.min(w.value * 2, 16)}px`,
                  backgroundColor: strokeWidth === w.value ? '#ffffff' : color,
                  borderRadius: '50%',
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('annotationToolbar.opacity')}
          </span>
          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{Math.round(opacity * 100)}%</span>
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
      <div
        style={{
          display: 'flex',
          gap: '6px',
          paddingTop: '12px',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <Tooltip content={t('annotationToolbar.undoTooltip')} position="top" disabled={!canUndo}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('annotationToolbar.undo')}
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
        </Tooltip>
        <Tooltip content={t('annotationToolbar.redoTooltip')} position="top" disabled={!canRedo}>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t('annotationToolbar.redo')}
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
        </Tooltip>
        <Tooltip content={t('annotationToolbar.clearAll')} position="top">
          <button
            onClick={() => setShowClearConfirm(true)}
            aria-label={t('annotationToolbar.clearAll')}
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
        </Tooltip>
      </div>

      {/* Stamp Picker */}
      {showStampPicker && activeTool === 'stamp' && (
        <div
          style={{
            paddingTop: '12px',
            borderTop: `1px solid ${borderColor}`,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: textLightColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            {t('annotationToolbar.stamps')}
          </span>

          {/* Stamp search */}
          <div style={{ marginBottom: '8px' }}>
            <input
              type="text"
              placeholder={t('annotationToolbar.searchStamps')}
              value={stampSearch}
              onChange={(e) => setStampSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                backgroundColor: bgTertiary,
                color: textColor,
                outline: 'none',
              }}
            />
          </div>

          {/* Category tabs */}
          {!stampSearch && (
            <div
              style={{
                display: 'flex',
                gap: '2px',
                marginBottom: '12px',
                backgroundColor: bgSecondary,
                padding: '3px',
                borderRadius: '8px',
                overflowX: 'auto',
              }}
            >
              {STAMP_CATEGORY_KEYS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setStampCategory(cat.id)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: stampCategory === cat.id ? (isDarkMode ? '#4b5563' : '#ffffff') : 'transparent',
                    color: stampCategory === cat.id ? textColor : textLightColor,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: stampCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t(cat.nameKey)}
                </button>
              ))}
            </div>
          )}

          {/* Stamps grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {filteredStamps.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '12px',
                  padding: '16px',
                }}
              >
                {t('annotationToolbar.noStampsInCategory')}
              </div>
            ) : (
              filteredStamps.map((stamp) => {
                const isTextStamp = stamp.svgData.includes('<text');
                const textMatch = stamp.svgData.match(/>([^<]+)<\/text>/);
                const stampText = textMatch ? textMatch[1] : stamp.name;

                return (
                  <button
                    key={stamp.id}
                    onClick={() => onStampSelect(stamp.id)}
                    title={stamp.name}
                    style={{
                      width: '40px',
                      height: '40px',
                      border: selectedStamp === stamp.id ? '2px solid #3b82f6' : `1px solid ${borderColor}`,
                      borderRadius: '8px',
                      backgroundColor: selectedStamp === stamp.id ? (isDarkMode ? '#1e3a5f' : '#eff6ff') : bgColor,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isTextStamp ? (
                      <span
                        style={{
                          fontSize: stampText.length > 3 ? '10px' : stampText.length > 2 ? '12px' : '16px',
                          fontWeight: 'bold',
                          fontStyle: 'italic',
                          color: isDarkMode ? '#fff' : '#000',
                          fontFamily: '"Times New Roman", Times, serif',
                          lineHeight: 1,
                        }}
                      >
                        {stampText}
                      </span>
                    ) : (
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 30 30"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stamp.svgData) }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Clear All Confirmation */}
      {showClearConfirm && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('annotationToolbar.clearConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={() => {
            setShowClearConfirm(false);
            onClear();
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
};

export default AnnotationToolbar;
