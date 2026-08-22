import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SkeletonTable } from '../../components/Skeleton';
import { getOrchestras, getConcertTypes } from '../../api';
import {
  useSeasons,
  useSeason,
  useSeasonTemplates,
  useUpdateSeason,
  useDeleteSeason,
  useCreateSeasonTemplate,
  useDeleteSeasonTemplate,
} from '../../hooks/useSeasons';
import { useQuery } from '@tanstack/react-query';
import { MANAGER_ROLES } from './types';
import { SeizoenDetail } from './SeizoenDetail';
import { SeizoenWizard } from './SeizoenWizard';
import { SeizoenenTab } from './SeizoenenTab';
import { SjablonenTab } from './SjablonenTab';
import { SjabloonFormulier } from './SjabloonFormulier';

/**
 * De seizoensplanner: overzicht van seizoenen en sjablonen, de detailweergave
 * van één seizoen, en de wizard om een nieuw seizoen op te zetten.
 *
 * Stond tot voor kort als één bestand van 1352 regels in SeasonPlanner.tsx.
 * Wat hier overblijft is wat de weergaven bij elkaar houdt: welk tabblad open
 * staat, welk seizoen bekeken wordt, de queries die de hele pagina voedt, en de
 * bevestigingen bij verwijderen. De weergaven zelf staan in de bestanden
 * ernaast.
 */
export default function SeasonPlanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.seasonPlanner');

  const isManager = user && MANAGER_ROLES.includes(user.role as (typeof MANAGER_ROLES)[number]);

  // Data queries
  const { data: seasons = [], isLoading: seasonsLoading } = useSeasons();
  const { data: templates = [] } = useSeasonTemplates();
  const { data: orchestras = [] } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
  });
  const { data: concertTypesData } = useQuery({
    queryKey: ['concertTypes'],
    queryFn: getConcertTypes,
  });
  const concertTypes = concertTypesData?.concertTypes || [];

  // Mutations
  const updateSeason = useUpdateSeason();
  const deleteSeason = useDeleteSeason();
  const createTemplate = useCreateSeasonTemplate();
  const deleteTemplate = useDeleteSeasonTemplate();

  // UI state
  const [activeTab, setActiveTab] = useState<'seasons' | 'templates' | 'wizard'>('seasons');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [deletingSeasonId, setDeletingSeasonId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    defaultRehearsalDay: 2,
    defaultRehearsalTime: '19:30',
    defaultRehearsalDuration: 120,
    defaultRehearsalLocation: '',
    typicalConcertsCount: 4,
  });

  // Selected season detail
  const { data: selectedSeason } = useSeason(selectedSeasonId || '');

  /**
   * De wizard openen.
   *
   * Zette hier eerst ook de wizardtoestand terug op de standaardwaarden. Die
   * toestand woont nu in SeizoenWizard, die alleen bestaat zolang dit tabblad
   * open staat - het aankoppelen doet nu wat het terugzetten deed.
   */
  const startWizard = () => {
    setActiveTab('wizard');
  };

  const handleCreateTemplate = async () => {
    if (!templateForm.name) return;

    await createTemplate.mutateAsync({
      name: templateForm.name,
      description: templateForm.description || undefined,
      defaultRehearsalDay: templateForm.defaultRehearsalDay,
      defaultRehearsalTime: templateForm.defaultRehearsalTime,
      defaultRehearsalDuration: templateForm.defaultRehearsalDuration,
      defaultRehearsalLocation: templateForm.defaultRehearsalLocation || undefined,
      typicalConcertsCount: templateForm.typicalConcertsCount,
    });

    setShowTemplateForm(false);
    setTemplateForm({
      name: '',
      description: '',
      defaultRehearsalDay: 2,
      defaultRehearsalTime: '19:30',
      defaultRehearsalDuration: 120,
      defaultRehearsalLocation: '',
      typicalConcertsCount: 4,
    });
  };

  const handleDeleteSeason = async (id: string) => {
    await deleteSeason.mutateAsync(id);
    setDeletingSeasonId(null);
    if (selectedSeasonId === id) {
      setSelectedSeasonId(null);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
    setDeletingTemplateId(null);
  };

  if (!isManager) {
    return (
      <div className="card">
        <div className="card-body">
          <p>{t('common.noPermission')}</p>
        </div>
      </div>
    );
  }

  if (seasonsLoading) {
    return (
      <div>
        <h1>{t('seasonPlanner.title')}</h1>
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  // Season Detail View
  if (selectedSeasonId && selectedSeason) {
    return (
      <SeizoenDetail
        seizoen={selectedSeason}
        onTerug={() => setSelectedSeasonId(null)}
        onStatusWijzigen={(status) => updateSeason.mutate({ id: selectedSeasonId, data: { status } })}
      />
    );
  }

  // Wizard View
  if (activeTab === 'wizard') {
    return (
      <SeizoenWizard
        templates={templates}
        orchestras={orchestras}
        concertTypes={concertTypes}
        onSluiten={() => setActiveTab('seasons')}
        onKlaar={(seizoenId) => {
          setActiveTab('seasons');
          setSelectedSeasonId(seizoenId);
        }}
      />
    );
  }

  // Main View (Seasons List / Templates)
  return (
    <div>
      <div className="page-header">
        <h1>{t('seasonPlanner.title')}</h1>
        <button className="btn btn-primary" onClick={startWizard}>
          <Icon name="plus" size={16} /> {t('seasonPlanner.newSeason')}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('seasons')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'seasons' ? 'bold' : 'normal',
            borderBottom: activeTab === 'seasons' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'seasons' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('seasonPlanner.tabs.seasons')}
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'templates' ? 'bold' : 'normal',
            borderBottom: activeTab === 'templates' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'templates' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('seasonPlanner.tabs.templates')}
        </button>
      </div>

      {/* Seasons Tab */}
      {activeTab === 'seasons' && (
        <SeizoenenTab
          seasons={seasons}
          onSelecteer={setSelectedSeasonId}
          onVerwijder={setDeletingSeasonId}
          onStartWizard={startWizard}
        />
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <SjablonenTab
          templates={templates}
          formulier={
            showTemplateForm && (
              <SjabloonFormulier
                templateForm={templateForm}
                setTemplateForm={setTemplateForm}
                onOpslaan={handleCreateTemplate}
                opslaanBezig={createTemplate.isPending}
                onAnnuleren={() => setShowTemplateForm(false)}
              />
            )
          }
          onNieuwSjabloon={() => setShowTemplateForm(true)}
          onVerwijder={setDeletingTemplateId}
        />
      )}

      {/* Delete Season Confirmation */}
      {deletingSeasonId && (
        <ConfirmDialog
          title={t('seasonPlanner.deleteSeason')}
          message={t('seasonPlanner.deleteSeasonConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteSeason.isPending}
          onConfirm={() => handleDeleteSeason(deletingSeasonId)}
          onCancel={() => setDeletingSeasonId(null)}
        />
      )}

      {/* Delete Template Confirmation */}
      {deletingTemplateId && (
        <ConfirmDialog
          title={t('seasonPlanner.deleteTemplate')}
          message={t('seasonPlanner.deleteTemplateConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteTemplate.isPending}
          onConfirm={() => handleDeleteTemplate(deletingTemplateId)}
          onCancel={() => setDeletingTemplateId(null)}
        />
      )}
    </div>
  );
}
