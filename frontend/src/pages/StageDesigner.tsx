import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInstruments } from '../hooks/useInstruments';
import {
  useStageLayouts,
  useStageLayout,
  useCreateStageLayout,
  useUpdateStageLayout,
  useDeleteStageLayout,
  useDuplicateStageLayout,
} from '../hooks/useStageLayouts';
import StageCanvas from '../components/StageCanvas';
import type { StageLayoutData, StagePosition, StageShape, StageSection } from '../types';
import { showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { SkeletonTable } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import './StageDesigner.css';

type Tool = 'select' | 'chair' | 'stand' | 'conductor' | 'piano' | 'percussion' | 'rect' | 'circle' | 'text';

const DEFAULT_LAYOUT_DATA: StageLayoutData = {
  positions: [],
  shapes: [],
  sections: [],
};

export default function StageDesigner() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle('pageTitle.stageDesigner');

  // Get layout ID from URL
  const layoutId = searchParams.get('id');

  // Queries
  const {
    data: layouts = [],
    isLoading: layoutsLoading,
    isError: layoutsFailed,
    refetch: refetchLayouts,
  } = useStageLayouts(true);
  const {
    data: layout,
    isLoading: layoutLoading,
    isError: layoutFailed,
    error: layoutError,
  } = useStageLayout(layoutId || '');
  const { data: instruments = [] } = useInstruments();

  // Mutations
  const createLayout = useCreateStageLayout();
  const updateLayout = useUpdateStageLayout();
  const deleteLayout = useDeleteStageLayout();
  const duplicateLayout = useDuplicateStageLayout();

  // Local state
  const [activeTab, setActiveTab] = useState<'list' | 'editor'>('list');
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(1);
  const [gridSnap, setGridSnap] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentSection, setCurrentSection] = useState<string | undefined>();

  // Layout editing state
  const [layoutName, setLayoutName] = useState('');
  const [layoutDescription, setLayoutDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [stageWidth, setStageWidth] = useState(1000);
  const [stageDepth, setStageDepth] = useState(600);
  const [isTemplate, setIsTemplate] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [layoutData, setLayoutData] = useState<StageLayoutData>(DEFAULT_LAYOUT_DATA);
  const [hasChanges, setHasChanges] = useState(false);

  // Modals
  const [showNewLayoutModal, setShowNewLayoutModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
  const [editingSection, setEditingSection] = useState<StageSection | null>(null);

  // Confirmation dialogs
  const [deletingLayoutId, setDeletingLayoutId] = useState<string | null>(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);

  // Section form
  const [sectionName, setSectionName] = useState('');
  const [sectionColor, setSectionColor] = useState('#4CAF50');
  const [sectionInstrumentId, setSectionInstrumentId] = useState('');

  // Load layout data when selected
  useEffect(() => {
    if (layout) {
      setLayoutName(layout.name);
      setLayoutDescription(layout.description || '');
      setVenueName(layout.venueName || '');
      setStageWidth(layout.stageWidth);
      setStageDepth(layout.stageDepth);
      setIsTemplate(layout.isTemplate);
      setIsDefault(layout.isDefault);
      setLayoutData(layout.layoutData || DEFAULT_LAYOUT_DATA);
      setHasChanges(false);
      setActiveTab('editor');
    }
  }, [layout]);

  // Track changes
  const handleLayoutDataChange = useCallback((data: StageLayoutData) => {
    setLayoutData(data);
    setHasChanges(true);
  }, []);

  // Create new layout
  const handleCreateLayout = async () => {
    if (!layoutName.trim()) {
      showError(t('stageDesigner.nameRequired', 'Naam is verplicht'));
      return;
    }

    try {
      const result = await createLayout.mutateAsync({
        name: layoutName,
        description: layoutDescription || undefined,
        venueName: venueName || undefined,
        stageWidth,
        stageDepth,
        isTemplate,
        isDefault,
        layoutData: DEFAULT_LAYOUT_DATA,
      });

      setShowNewLayoutModal(false);
      setSearchParams({ id: result.id });
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Save layout
  const handleSaveLayout = async () => {
    if (!layoutId) return;

    try {
      await updateLayout.mutateAsync({
        id: layoutId,
        layout: {
          name: layoutName,
          description: layoutDescription || undefined,
          venueName: venueName || undefined,
          stageWidth,
          stageDepth,
          isTemplate,
          isDefault,
          layoutData,
        },
      });
      setHasChanges(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Delete layout
  const handleDeleteLayout = async (id: string) => {
    try {
      await deleteLayout.mutateAsync(id);
      if (layoutId === id) {
        setSearchParams({});
        setActiveTab('list');
        resetEditor();
      }
    } catch (error) {
      // Error handled by mutation
    } finally {
      setDeletingLayoutId(null);
    }
  };

  // Duplicate layout
  const handleDuplicateLayout = async (id: string) => {
    try {
      const result = await duplicateLayout.mutateAsync({ id });
      setSearchParams({ id: result.id });
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Terug naar het overzicht: de gekozen indeling loslaten en de editor legen.
  const goToList = () => {
    setSearchParams({});
    setActiveTab('list');
    resetEditor();
  };

  // Reset editor state
  const resetEditor = () => {
    setLayoutName('');
    setLayoutDescription('');
    setVenueName('');
    setStageWidth(1000);
    setStageDepth(600);
    setIsTemplate(false);
    setIsDefault(false);
    setLayoutData(DEFAULT_LAYOUT_DATA);
    setHasChanges(false);
    setSelectedIds([]);
    setTool('select');
  };

  // Handle section save
  const handleSaveSection = () => {
    if (!sectionName.trim()) {
      showError(t('stageDesigner.sectionNameRequired', 'Sectienaam is verplicht'));
      return;
    }

    const newSection: StageSection = {
      id: editingSection?.id || `section-${Date.now()}`,
      name: sectionName,
      color: sectionColor,
      instrumentId: sectionInstrumentId || undefined,
    };

    if (editingSection) {
      // Update existing
      setLayoutData({
        ...layoutData,
        sections: layoutData.sections.map((s) => (s.id === editingSection.id ? newSection : s)),
      });
    } else {
      // Add new
      setLayoutData({
        ...layoutData,
        sections: [...layoutData.sections, newSection],
      });
    }

    setHasChanges(true);
    setShowSectionModal(false);
    setEditingSection(null);
    setSectionName('');
    setSectionColor('#4CAF50');
    setSectionInstrumentId('');
    setCurrentSection(newSection.id);
  };

  // Delete section
  const handleDeleteSection = (sectionId: string) => {
    setLayoutData({
      ...layoutData,
      sections: layoutData.sections.filter((s) => s.id !== sectionId),
      positions: layoutData.positions.map((p) => (p.section === sectionId ? { ...p, section: undefined } : p)),
    });
    setHasChanges(true);
    if (currentSection === sectionId) {
      setCurrentSection(undefined);
    }
  };

  // Get selected element
  const selectedElement = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    const pos = layoutData.positions.find((p) => p.id === id);
    if (pos) return { type: 'position' as const, data: pos };
    const shape = layoutData.shapes.find((s) => s.id === id);
    if (shape) return { type: 'shape' as const, data: shape };
    return null;
  }, [selectedIds, layoutData]);

  // Update selected element property
  const updateSelectedProperty = (key: string, value: any) => {
    if (!selectedElement) return;

    if (selectedElement.type === 'position') {
      setLayoutData({
        ...layoutData,
        positions: layoutData.positions.map((p) => (p.id === selectedElement.data.id ? { ...p, [key]: value } : p)),
      });
    } else {
      setLayoutData({
        ...layoutData,
        shapes: layoutData.shapes.map((s) => (s.id === selectedElement.data.id ? { ...s, [key]: value } : s)),
      });
    }
    setHasChanges(true);
  };

  // Tool buttons
  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'select', icon: '↖', label: t('stageDesigner.tools.select', 'Selecteren') },
    { id: 'chair', icon: '🪑', label: t('stageDesigner.tools.chair', 'Stoel') },
    { id: 'stand', icon: '🎵', label: t('stageDesigner.tools.stand', 'Lessenaar') },
    { id: 'conductor', icon: '🎼', label: t('stageDesigner.tools.conductor', 'Dirigent') },
    { id: 'piano', icon: '🎹', label: t('stageDesigner.tools.piano', 'Piano') },
    { id: 'percussion', icon: '🥁', label: t('stageDesigner.tools.percussion', 'Slagwerk') },
    { id: 'rect', icon: '⬜', label: t('stageDesigner.tools.rect', 'Rechthoek') },
    { id: 'circle', icon: '⭕', label: t('stageDesigner.tools.circle', 'Cirkel') },
    { id: 'text', icon: 'T', label: t('stageDesigner.tools.text', 'Tekst') },
  ];

  if (layoutsLoading) {
    return (
      <div className="page-container">
        <h1>{t('stageDesigner.title', 'Podiumindeling Designer')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="stage-designer-page">
      <div className="page-header">
        <h1>{t('stageDesigner.title', 'Podiumindeling Designer')}</h1>
        <div className="header-actions">
          {activeTab === 'editor' && layoutId && (
            <>
              {hasChanges && (
                <span className="unsaved-indicator">
                  {t('stageDesigner.unsavedChanges', 'Niet-opgeslagen wijzigingen')}
                </span>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (hasChanges) {
                    setPendingDiscardAction(() => goToList);
                    return;
                  }
                  goToList();
                }}
              >
                {t('common.back', 'Terug')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveLayout}
                disabled={updateLayout.isPending || !hasChanges}
              >
                {updateLayout.isPending ? t('common.saving', 'Opslaan...') : t('common.save', 'Opslaan')}
              </button>
            </>
          )}
          {activeTab === 'list' && (
            <button
              className="btn btn-primary"
              onClick={() => {
                resetEditor();
                setShowNewLayoutModal(true);
              }}
            >
              {t('stageDesigner.newLayout', 'Nieuwe indeling')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button
          className={`tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => {
            if (hasChanges) {
              setPendingDiscardAction(() => goToList);
              return;
            }
            goToList();
          }}
        >
          {t('stageDesigner.tabs.layouts', 'Indelingen')}
        </button>
        <button
          className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => {
            if (!layoutId) {
              showError(t('stageDesigner.selectLayoutFirst', 'Selecteer eerst een indeling'));
            }
          }}
          disabled={!layoutId || layoutFailed}
        >
          {t('stageDesigner.tabs.editor', 'Editor')}
        </button>
      </div>

      {/*
        De gevraagde indeling kwam niet binnen: verwijderd, of van een andere
        vereniging - de server geeft daar 404 op, want hij zoekt binnen de
        vereniging van de ingelogde gebruiker. Zonder deze melding bleef de
        gebruiker op het overzicht staan zonder dat er iets gebeurde, terwijl
        het tabblad Editor wel aanklikbaar was en niets deed.
      */}
      {layoutId && layoutFailed && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-body empty-state">
            <p>{getErrorMessage(layoutError)}</p>
            <button className="btn btn-secondary" onClick={goToList}>
              {t('common.back', 'Terug')}
            </button>
          </div>
        </div>
      )}

      {/* List View */}
      {activeTab === 'list' && (
        <div className="card">
          <div className="card-body">
            {/*
              Een mislukte aanvraag is niet hetzelfde als een lege lijst. Ging
              het ophalen mis, dan stond hier eerder 'Nog geen podiumindelingen'
              met een knop om er een te maken - de gebruiker las dat zijn
              indelingen weg waren, terwijl de server alleen niet antwoordde.
            */}
            {layoutsFailed ? (
              <div className="empty-state">
                <p>{t('errors.generic')}</p>
                <button className="btn btn-secondary" onClick={() => refetchLayouts()}>
                  {t('common.retry', 'Opnieuw proberen')}
                </button>
              </div>
            ) : layouts.length === 0 ? (
              <div className="empty-state">
                <p>{t('stageDesigner.noLayouts', 'Nog geen podiumindelingen.')}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    resetEditor();
                    setShowNewLayoutModal(true);
                  }}
                >
                  {t('stageDesigner.createFirst', 'Maak je eerste indeling')}
                </button>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name', 'Naam')}</th>
                    <th>{t('stageDesigner.venue', 'Locatie')}</th>
                    <th>{t('stageDesigner.dimensions', 'Afmetingen')}</th>
                    <th>{t('stageDesigner.usage', 'Gebruik')}</th>
                    <th style={{ width: '200px' }}>{t('common.actions', 'Acties')}</th>
                  </tr>
                </thead>
                <tbody>
                  {layouts.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="layout-name">
                          <span>{l.name}</span>
                          {l.isDefault && (
                            <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
                              {t('stageDesigner.default', 'Standaard')}
                            </span>
                          )}
                          {l.isTemplate && (
                            <span className="badge badge-secondary" style={{ marginLeft: '8px' }}>
                              {t('stageDesigner.template', 'Template')}
                            </span>
                          )}
                        </div>
                        {l.description && <div className="layout-description">{l.description}</div>}
                      </td>
                      <td>{l.venueName || '-'}</td>
                      <td>
                        {l.stageWidth} x {l.stageDepth}
                      </td>
                      <td>
                        {l.usageCount || 0} {t('stageDesigner.concerts', 'concert(en)')}
                      </td>
                      <td>
                        <div className="btn-group">
                          <button className="btn btn-secondary btn-sm" onClick={() => setSearchParams({ id: l.id })}>
                            {t('common.edit', 'Bewerken')}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDuplicateLayout(l.id)}>
                            {t('stageDesigner.duplicate', 'Dupliceren')}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingLayoutId(l.id)}
                            disabled={(l.usageCount || 0) > 0}
                            title={
                              (l.usageCount || 0) > 0
                                ? t('stageDesigner.cannotDeleteInUse', 'Kan niet verwijderen: in gebruik')
                                : ''
                            }
                          >
                            {t('common.delete', 'Verwijderen')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Editor View */}
      {activeTab === 'editor' && layoutId && (
        <div className="stage-editor">
          {/* Toolbar */}
          <div className="editor-toolbar">
            <div className="toolbar-group">
              <label>{t('stageDesigner.tools.title', 'Gereedschap')}:</label>
              <div className="tool-buttons">
                {tools.map((t) => (
                  <button
                    key={t.id}
                    className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                    onClick={() => setTool(t.id)}
                    title={t.label}
                  >
                    <span className="tool-icon">{t.icon}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="toolbar-group">
              <label>{t('stageDesigner.zoom', 'Zoom')}:</label>
              <button className="btn btn-sm" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}>
                -
              </button>
              <span className="zoom-level">{Math.round(zoom * 100)}%</span>
              <button className="btn btn-sm" onClick={() => setZoom(Math.min(2, zoom + 0.25))}>
                +
              </button>
            </div>

            <div className="toolbar-group">
              <label>
                <input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)} />
                {t('stageDesigner.gridSnap', 'Raster')}
              </label>
            </div>

            <div className="toolbar-group">
              <button className="btn btn-sm" onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}>
                {showPropertiesPanel
                  ? t('stageDesigner.hideProperties', 'Verberg eigenschappen')
                  : t('stageDesigner.showProperties', 'Toon eigenschappen')}
              </button>
            </div>
          </div>

          <div className="editor-content">
            {/* Left Sidebar - Sections */}
            <div className="editor-sidebar left">
              <h3>{t('stageDesigner.sections', 'Secties')}</h3>
              <div className="sections-list">
                <button
                  className={`section-item ${!currentSection ? 'active' : ''}`}
                  onClick={() => setCurrentSection(undefined)}
                >
                  <span className="section-color" style={{ backgroundColor: '#cccccc' }} />
                  <span>{t('stageDesigner.noSection', 'Geen sectie')}</span>
                </button>
                {layoutData.sections.map((section) => (
                  <div key={section.id} className={`section-item ${currentSection === section.id ? 'active' : ''}`}>
                    <button className="section-select" onClick={() => setCurrentSection(section.id)}>
                      <span className="section-color" style={{ backgroundColor: section.color }} />
                      <span>{section.name}</span>
                    </button>
                    <div className="section-actions">
                      <button
                        className="btn-icon"
                        onClick={() => {
                          setEditingSection(section);
                          setSectionName(section.name);
                          setSectionColor(section.color);
                          setSectionInstrumentId(section.instrumentId || '');
                          setShowSectionModal(true);
                        }}
                        title={t('common.edit', 'Bewerken')}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => handleDeleteSection(section.id)}
                        title={t('common.delete', 'Verwijderen')}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setEditingSection(null);
                  setSectionName('');
                  setSectionColor('#4CAF50');
                  setSectionInstrumentId('');
                  setShowSectionModal(true);
                }}
                style={{ marginTop: '0.5rem', width: '100%' }}
              >
                + {t('stageDesigner.addSection', 'Sectie toevoegen')}
              </button>
            </div>

            {/* Canvas */}
            <div className="editor-canvas">
              {layoutLoading ? (
                <div className="loading-spinner" />
              ) : (
                <StageCanvas
                  width={stageWidth}
                  height={stageDepth}
                  layoutData={layoutData}
                  selectedIds={selectedIds}
                  tool={tool}
                  gridSnap={gridSnap}
                  zoom={zoom}
                  currentSection={currentSection}
                  onLayoutChange={handleLayoutDataChange}
                  onSelectionChange={setSelectedIds}
                />
              )}
            </div>

            {/* Right Sidebar - Properties */}
            {showPropertiesPanel && (
              <div className="editor-sidebar right">
                <h3>{t('stageDesigner.properties', 'Eigenschappen')}</h3>

                {/* Layout Properties */}
                <div className="properties-section">
                  <h4>{t('stageDesigner.layoutProperties', 'Indeling')}</h4>
                  <div className="form-group">
                    <label>{t('common.name', 'Naam')}</label>
                    <input
                      type="text"
                      value={layoutName}
                      onChange={(e) => {
                        setLayoutName(e.target.value);
                        setHasChanges(true);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('stageDesigner.venue', 'Locatie')}</label>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => {
                        setVenueName(e.target.value);
                        setHasChanges(true);
                      }}
                      placeholder={t('stageDesigner.venuePlaceholder', 'bijv. Concertgebouw')}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('stageDesigner.width', 'Breedte')}</label>
                      <input
                        type="number"
                        value={stageWidth}
                        onChange={(e) => {
                          setStageWidth(Number(e.target.value));
                          setHasChanges(true);
                        }}
                        min={200}
                        max={5000}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('stageDesigner.depth', 'Diepte')}</label>
                      <input
                        type="number"
                        value={stageDepth}
                        onChange={(e) => {
                          setStageDepth(Number(e.target.value));
                          setHasChanges(true);
                        }}
                        min={200}
                        max={5000}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={(e) => {
                          setIsDefault(e.target.checked);
                          setHasChanges(true);
                        }}
                      />
                      {t('stageDesigner.setAsDefault', 'Standaard indeling')}
                    </label>
                  </div>
                </div>

                {/* Selected Element Properties */}
                {selectedElement && (
                  <div className="properties-section">
                    <h4>
                      {selectedElement.type === 'position'
                        ? t('stageDesigner.positionProperties', 'Positie')
                        : t('stageDesigner.shapeProperties', 'Vorm')}
                    </h4>

                    {selectedElement.type === 'position' && (
                      <>
                        <div className="form-group">
                          <label>{t('stageDesigner.label', 'Label')}</label>
                          <input
                            type="text"
                            value={(selectedElement.data as StagePosition).label || ''}
                            onChange={(e) => updateSelectedProperty('label', e.target.value)}
                            placeholder={t('stageDesigner.labelPlaceholder', 'bijv. Vl1-1')}
                          />
                        </div>
                        <div className="form-group">
                          <label>{t('stageDesigner.section', 'Sectie')}</label>
                          <select
                            value={(selectedElement.data as StagePosition).section || ''}
                            onChange={(e) => updateSelectedProperty('section', e.target.value || undefined)}
                          >
                            <option value="">{t('stageDesigner.noSection', 'Geen sectie')}</option>
                            {layoutData.sections.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>{t('stageDesigner.rotation', 'Rotatie')} (graden)</label>
                          <input
                            type="number"
                            value={(selectedElement.data as StagePosition).rotation || 0}
                            onChange={(e) => updateSelectedProperty('rotation', Number(e.target.value))}
                            min={-180}
                            max={180}
                            step={15}
                          />
                        </div>
                      </>
                    )}

                    {selectedElement.type === 'shape' && (
                      <>
                        <div className="form-group">
                          <label>{t('stageDesigner.label', 'Label')}</label>
                          <input
                            type="text"
                            value={(selectedElement.data as StageShape).label || ''}
                            onChange={(e) => updateSelectedProperty('label', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>{t('stageDesigner.fillColor', 'Vulkleur')}</label>
                          <input
                            type="color"
                            value={(selectedElement.data as StageShape).fill || '#e0e0e0'}
                            onChange={(e) => updateSelectedProperty('fill', e.target.value)}
                          />
                        </div>
                        {(selectedElement.data as StageShape).type === 'rect' && (
                          <div className="form-row">
                            <div className="form-group">
                              <label>{t('stageDesigner.width', 'Breedte')}</label>
                              <input
                                type="number"
                                value={(selectedElement.data as StageShape).width || 100}
                                onChange={(e) => updateSelectedProperty('width', Number(e.target.value))}
                                min={20}
                              />
                            </div>
                            <div className="form-group">
                              <label>{t('stageDesigner.height', 'Hoogte')}</label>
                              <input
                                type="number"
                                value={(selectedElement.data as StageShape).height || 60}
                                onChange={(e) => updateSelectedProperty('height', Number(e.target.value))}
                                min={20}
                              />
                            </div>
                          </div>
                        )}
                        {(selectedElement.data as StageShape).type === 'circle' && (
                          <div className="form-group">
                            <label>{t('stageDesigner.radius', 'Straal')}</label>
                            <input
                              type="number"
                              value={(selectedElement.data as StageShape).radius || 50}
                              onChange={(e) => updateSelectedProperty('radius', Number(e.target.value))}
                              min={10}
                            />
                          </div>
                        )}
                        {(selectedElement.data as StageShape).type === 'text' && (
                          <div className="form-group">
                            <label>{t('stageDesigner.fontSize', 'Tekstgrootte')}</label>
                            <input
                              type="number"
                              value={(selectedElement.data as StageShape).fontSize || 16}
                              onChange={(e) => updateSelectedProperty('fontSize', Number(e.target.value))}
                              min={8}
                              max={72}
                            />
                          </div>
                        )}
                      </>
                    )}

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (selectedElement.type === 'position') {
                          setLayoutData({
                            ...layoutData,
                            positions: layoutData.positions.filter((p) => p.id !== selectedElement.data.id),
                          });
                        } else {
                          setLayoutData({
                            ...layoutData,
                            shapes: layoutData.shapes.filter((s) => s.id !== selectedElement.data.id),
                          });
                        }
                        setSelectedIds([]);
                        setHasChanges(true);
                      }}
                      style={{ marginTop: '0.5rem', width: '100%' }}
                    >
                      {t('stageDesigner.deleteElement', 'Element verwijderen')}
                    </button>
                  </div>
                )}

                {/* Stats */}
                <div className="properties-section">
                  <h4>{t('stageDesigner.statistics', 'Statistieken')}</h4>
                  <div className="stats-list">
                    <div className="stat-item">
                      <span>{t('stageDesigner.positions', 'Posities')}:</span>
                      <span>{layoutData.positions.length}</span>
                    </div>
                    <div className="stat-item">
                      <span>{t('stageDesigner.shapes', 'Vormen')}:</span>
                      <span>{layoutData.shapes.length}</span>
                    </div>
                    <div className="stat-item">
                      <span>{t('stageDesigner.sections', 'Secties')}:</span>
                      <span>{layoutData.sections.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Layout Modal */}
      {showNewLayoutModal && (
        <div className="modal-overlay" onClick={() => setShowNewLayoutModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('stageDesigner.newLayout', 'Nieuwe indeling')}</h3>
              <button className="modal-close" onClick={() => setShowNewLayoutModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t('common.name', 'Naam')} *</label>
                <input
                  type="text"
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  placeholder={t('stageDesigner.namePlaceholder', 'bijv. Standaard symfonieorkest')}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>{t('common.description', 'Beschrijving')}</label>
                <textarea value={layoutDescription} onChange={(e) => setLayoutDescription(e.target.value)} rows={2} />
              </div>
              <div className="form-group">
                <label>{t('stageDesigner.venue', 'Locatie')}</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder={t('stageDesigner.venuePlaceholder', 'bijv. Concertgebouw')}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('stageDesigner.width', 'Breedte')} (px)</label>
                  <input
                    type="number"
                    value={stageWidth}
                    onChange={(e) => setStageWidth(Number(e.target.value))}
                    min={200}
                    max={5000}
                  />
                </div>
                <div className="form-group">
                  <label>{t('stageDesigner.depth', 'Diepte')} (px)</label>
                  <input
                    type="number"
                    value={stageDepth}
                    onChange={(e) => setStageDepth(Number(e.target.value))}
                    min={200}
                    max={5000}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                  {t('stageDesigner.setAsDefault', 'Standaard indeling')}
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewLayoutModal(false)}>
                {t('common.cancel', 'Annuleren')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateLayout}
                disabled={createLayout.isPending || !layoutName.trim()}
              >
                {createLayout.isPending ? t('common.loading', 'Laden...') : t('common.create', 'Aanmaken')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Modal */}
      {showSectionModal && (
        <div className="modal-overlay" onClick={() => setShowSectionModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingSection
                  ? t('stageDesigner.editSection', 'Sectie bewerken')
                  : t('stageDesigner.addSection', 'Sectie toevoegen')}
              </h3>
              <button className="modal-close" onClick={() => setShowSectionModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t('common.name', 'Naam')} *</label>
                <input
                  type="text"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder={t('stageDesigner.sectionNamePlaceholder', 'bijv. Violen 1')}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>{t('stageDesigner.color', 'Kleur')}</label>
                <div className="color-picker-row">
                  <input type="color" value={sectionColor} onChange={(e) => setSectionColor(e.target.value)} />
                  <div className="preset-colors">
                    {['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFEB3B', '#795548'].map(
                      (color) => (
                        <button
                          key={color}
                          className="preset-color"
                          style={{ backgroundColor: color }}
                          onClick={() => setSectionColor(color)}
                          type="button"
                        />
                      ),
                    )}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>{t('stageDesigner.instrument', 'Instrument')}</label>
                <select value={sectionInstrumentId} onChange={(e) => setSectionInstrumentId(e.target.value)}>
                  <option value="">{t('common.none', 'Geen')}</option>
                  {instruments.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                      {inst.tuning ? ` (${inst.tuning})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSectionModal(false)}>
                {t('common.cancel', 'Annuleren')}
              </button>
              <button className="btn btn-primary" onClick={handleSaveSection} disabled={!sectionName.trim()}>
                {t('common.save', 'Opslaan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Layout Confirmation */}
      {deletingLayoutId && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('stageDesigner.confirmDelete', 'Weet je zeker dat je deze podiumindeling wilt verwijderen?')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteLayout.isPending}
          onConfirm={() => handleDeleteLayout(deletingLayoutId)}
          onCancel={() => setDeletingLayoutId(null)}
        />
      )}

      {/* Discard Changes Confirmation */}
      {pendingDiscardAction && (
        <ConfirmDialog
          title={t('common.warning')}
          message={t('stageDesigner.discardChanges', 'Wijzigingen negeren?')}
          confirmLabel={t('common.confirm')}
          variant="warning"
          onConfirm={() => {
            pendingDiscardAction();
            setPendingDiscardAction(null);
          }}
          onCancel={() => setPendingDiscardAction(null)}
        />
      )}
    </div>
  );
}
