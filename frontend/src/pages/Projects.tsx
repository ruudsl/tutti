import { formatCurrency } from '../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  getProjects,
  getProject,
  createProject,
  updateProjectStatus,
  deleteProject,
  ProjectStatus,
  CreateProjectData,
  ProjectDetail,
} from '../api/projects';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDate } from '../utils/dateFormat';
import { ProjectEventsSection } from '../components/ProjectEventsSection';
import { ProjectSetlistSection } from '../components/ProjectSetlistSection';
import { useConfirm } from '../hooks/useConfirm';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'badge-info',
  active: 'badge-success',
  completed: 'badge-primary',
  cancelled: 'badge-error',
  archived: 'badge-ghost',
};

export default function Projects() {
  const { t } = useTranslation();
  useDocumentTitle('projects.title');
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', statusFilter],
    queryFn: () => getProjects(statusFilter ? { status: statusFilter } : undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      showSuccess(t('projects.deleted'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => showError(t('projects.errorDelete')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) => updateProjectStatus(id, status),
    onSuccess: () => {
      showSuccess(t('projects.statusUpdated'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => showError(t('projects.errorUpdate')),
  });

  const activeProjects = projects.filter((p) => p.status === 'active');
  const planningProjects = projects.filter((p) => p.status === 'planning');

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
        <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={18} />
          {t('projects.new')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('projects.total')}</div>
            <div className="text-2xl font-bold">{projects.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('projects.active')}</div>
            <div className="text-2xl font-bold text-success">{activeProjects.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('projects.planning')}</div>
            <div className="text-2xl font-bold text-info">{planningProjects.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('projects.completed')}</div>
            <div className="text-2xl font-bold">{projects.filter((p) => p.status === 'completed').length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="select select-bordered select-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | '')}
        >
          <option value="">{t('projects.allStatuses')}</option>
          <option value="planning">{t('projects.statuses.planning')}</option>
          <option value="active">{t('projects.statuses.active')}</option>
          <option value="completed">{t('projects.statuses.completed')}</option>
          <option value="cancelled">{t('projects.statuses.cancelled')}</option>
          <option value="archived">{t('projects.statuses.archived')}</option>
        </select>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="folder" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('projects.noProjects')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedProjectId(project.id)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h3 className="card-title text-lg">{project.name}</h3>
                  <span className={`badge ${STATUS_COLORS[project.status]}`}>
                    {t(`projects.statuses.${project.status}`)}
                  </span>
                </div>

                {project.description && (
                  <p className="text-sm text-base-content/70 line-clamp-2">{project.description}</p>
                )}

                <div className="flex flex-wrap gap-2 text-sm text-base-content/60">
                  {project.startDate && (
                    <span className="flex items-center gap-1">
                      <Icon name="calendar" size={14} />
                      {formatDate(project.startDate)}
                    </span>
                  )}
                  {project.orchestraName && (
                    <span className="flex items-center gap-1">
                      <Icon name="music" size={14} />
                      {project.orchestraName}
                    </span>
                  )}
                </div>

                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={14} />
                    {project.memberCount} {t('projects.members')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="music2" size={14} />
                    {project.concertCount} {t('projects.concerts')}
                  </span>
                </div>

                <div className="card-actions justify-end mt-2">
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-ghost btn-sm">
                      <Icon name="menu" size={16} />
                    </label>
                    <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-10">
                      {project.status === 'planning' && (
                        <li>
                          <button onClick={() => statusMutation.mutate({ id: project.id, status: 'active' })}>
                            {t('projects.markActive')}
                          </button>
                        </li>
                      )}
                      {project.status === 'active' && (
                        <li>
                          <button onClick={() => statusMutation.mutate({ id: project.id, status: 'completed' })}>
                            {t('projects.markCompleted')}
                          </button>
                        </li>
                      )}
                      <li>
                        <button onClick={() => statusMutation.mutate({ id: project.id, status: 'archived' })}>
                          {t('projects.archive')}
                        </button>
                      </li>
                      <li className="text-error">
                        <button
                          onClick={async () => {
                            if (await confirmDialog(t('projects.confirmDelete'))) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                        >
                          {t('common.delete')}
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <ProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {selectedProjectId && (
        <ProjectDetailModal
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}
        />
      )}
    </div>
  );
}

function ProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateProjectData>({
    name: '',
    description: '',
    projectType: 'concert',
    startDate: '',
    endDate: '',
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      showSuccess(t('projects.created'));
      onSuccess();
    },
    onError: () => showError(t('projects.errorCreate')),
  });

  const canSubmit = formData.name.trim().length > 0;

  return (
    <Modal onClose={onClose} title={t('projects.new')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('projects.startDate')}</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('projects.endDate')}</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('projects.type')}</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.projectType}
            onChange={(e) => setFormData({ ...formData, projectType: e.target.value as any })}
          >
            <option value="concert">{t('projects.types.concert')}</option>
            <option value="competition">{t('projects.types.competition')}</option>
            <option value="festival">{t('projects.types.festival')}</option>
            <option value="tour">{t('projects.types.tour')}</option>
            <option value="recording">{t('projects.types.recording')}</option>
            <option value="other">{t('projects.types.other')}</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const MEMBER_STATUS_COLORS: Record<string, string> = {
  invited: 'badge-info',
  confirmed: 'badge-success',
  declined: 'badge-error',
};

function ProjectDetailModal({ projectId, onClose }: { projectId: string; onClose: () => void; onRefresh: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'setlist' | 'events' | 'schedule'>('overview');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });

  const handleProjectUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  if (isLoading) {
    return (
      <Modal onClose={onClose} title={t('common.loading')}>
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </Modal>
    );
  }

  if (!project) {
    return (
      <Modal onClose={onClose} title={t('common.error')}>
        <p>{t('projects.notFound')}</p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={project.name} className="max-w-4xl">
      <div className="space-y-6">
        {/* Header Info */}
        <div className="flex flex-wrap items-center gap-4">
          <span className={`badge ${STATUS_COLORS[project.status]} badge-lg`}>
            {t(`projects.statuses.${project.status}`)}
          </span>
          <span className="badge badge-outline">{t(`projects.types.${project.projectType}`)}</span>
          {project.orchestraName && (
            <span className="flex items-center gap-1 text-base-content/70">
              <Icon name="music" size={16} />
              {project.orchestraName}
            </span>
          )}
          {project.startDate && (
            <span className="flex items-center gap-1 text-base-content/70">
              <Icon name="calendar" size={16} />
              {formatDate(project.startDate)}
              {project.endDate && ` - ${formatDate(project.endDate)}`}
            </span>
          )}
        </div>

        {project.description && <p className="text-base-content/80">{project.description}</p>}

        {/* Stats */}
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Icon name="users" size={16} className="text-primary" />
            <span>
              {project.members.length} {t('projects.members')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="music2" size={16} className="text-primary" />
            <span>
              {project.concerts.length} {t('projects.concerts')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="calendar" size={16} className="text-primary" />
            <span>
              {project.rehearsals.length} {t('projects.rehearsals')}
            </span>
          </div>
          {project.budget && (
            <div className="flex items-center gap-2">
              <Icon name="creditCard" size={16} className="text-primary" />
              <span>{formatCurrency(project.budget)}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs tabs-boxed flex-wrap">
          <button
            className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Icon name="info" size={16} className="mr-1" />
            {t('projects.overview')}
          </button>
          <button
            className={`tab ${activeTab === 'members' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            <Icon name="users" size={16} className="mr-1" />
            {t('projects.members')} ({project.members.length})
          </button>
          <button
            className={`tab ${activeTab === 'setlist' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('setlist')}
          >
            <Icon name="listMusic" size={16} className="mr-1" />
            {t('projects.setlist')} ({project.setlist.length})
          </button>
          <button
            className={`tab ${activeTab === 'events' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            <Icon name="link" size={16} className="mr-1" />
            {t('projects.events.label')}
          </button>
          <button
            className={`tab ${activeTab === 'schedule' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <Icon name="calendar" size={16} className="mr-1" />
            {t('projects.schedule')}
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === 'overview' && <ProjectOverviewTab project={project} />}
          {activeTab === 'members' && <ProjectMembersTab members={project.members} />}
          {activeTab === 'setlist' && <ProjectSetlistSection project={project} onUpdate={handleProjectUpdate} />}
          {activeTab === 'events' && <ProjectEventsSection project={project} onUpdate={handleProjectUpdate} />}
          {activeTab === 'schedule' && (
            <ProjectScheduleTab concerts={project.concerts} rehearsals={project.rehearsals} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProjectOverviewTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {project.notes && (
        <div className="card bg-base-200 p-4">
          <h4 className="font-medium mb-2">{t('common.notes')}</h4>
          <p className="text-sm whitespace-pre-wrap">{project.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-base-200 p-4">
          <h4 className="text-sm text-base-content/60">{t('projects.createdBy')}</h4>
          <p className="font-medium">{project.createdByName}</p>
        </div>
        <div className="card bg-base-200 p-4">
          <h4 className="text-sm text-base-content/60">{t('common.created')}</h4>
          <p className="font-medium">{formatDate(project.createdAt)}</p>
        </div>
      </div>

      {/* Upcoming Concerts */}
      {project.concerts.length > 0 && (
        <div className="card bg-base-200 p-4">
          <h4 className="font-medium mb-2">{t('projects.upcomingConcerts')}</h4>
          <div className="space-y-2">
            {project.concerts.slice(0, 3).map((concert) => (
              <div key={concert.id} className="flex justify-between items-center p-2 bg-base-100 rounded">
                <span className="font-medium">{concert.name}</span>
                <div className="flex items-center gap-2 text-sm text-base-content/70">
                  <Icon name="calendar" size={14} />
                  {formatDate(concert.date)}
                  {concert.venue && (
                    <>
                      <Icon name="mapPin" size={14} />
                      {concert.venue}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectMembersTab({ members }: { members: ProjectDetail['members'] }) {
  const { t } = useTranslation();

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="users" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('projects.noMembers')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            <th>{t('common.email')}</th>
            <th>{t('projects.role')}</th>
            <th>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">
                {m.firstName} {m.lastName}
              </td>
              <td className="text-base-content/70">{m.email}</td>
              <td>{m.role}</td>
              <td>
                <span className={`badge badge-sm ${MEMBER_STATUS_COLORS[m.status] || 'badge-ghost'}`}>
                  {t(`projects.memberStatuses.${m.status}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectScheduleTab({
  concerts,
  rehearsals,
}: {
  concerts: ProjectDetail['concerts'];
  rehearsals: ProjectDetail['rehearsals'];
}) {
  const { t } = useTranslation();

  const allEvents = [
    ...concerts.map((c) => ({ ...c, type: 'concert' as const })),
    ...rehearsals.map((r) => ({ ...r, type: 'rehearsal' as const, name: t('projects.rehearsal') })),
  ].sort((a, b) => {
    const dateA = 'date' in a ? a.date : '';
    const dateB = 'date' in b ? b.date : '';
    return dateA.localeCompare(dateB);
  });

  if (allEvents.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="calendar" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('projects.noSchedule')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allEvents.map((event) => (
        <div
          key={`${event.type}-${event.id}`}
          className={`flex items-center gap-4 p-3 rounded-lg ${
            event.type === 'concert' ? 'bg-primary/10' : 'bg-base-200'
          }`}
        >
          <Icon
            name={event.type === 'concert' ? 'music2' : 'users'}
            size={20}
            className={event.type === 'concert' ? 'text-primary' : 'text-base-content/60'}
          />
          <div className="flex-1">
            <div className="font-medium">{'name' in event ? event.name : t('projects.rehearsal')}</div>
            <div className="text-sm text-base-content/60 flex items-center gap-2">
              <Icon name="calendar" size={12} />
              {formatDate('date' in event ? event.date : '')}
              {event.type === 'rehearsal' && 'startTime' in event && (
                <>
                  <Icon name="clock" size={12} />
                  {event.startTime} - {event.endTime}
                </>
              )}
              {(event.type === 'concert' && 'venue' in event && event.venue) ||
              (event.type === 'rehearsal' && 'location' in event && event.location) ? (
                <>
                  <Icon name="mapPin" size={12} />
                  {event.type === 'concert' ? event.venue : event.location}
                </>
              ) : null}
            </div>
          </div>
          <span className={`badge badge-sm ${event.type === 'concert' ? 'badge-primary' : 'badge-ghost'}`}>
            {event.type === 'concert' ? t('projects.concert') : t('projects.rehearsal')}
          </span>
        </div>
      ))}
    </div>
  );
}
