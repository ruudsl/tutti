import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { getProjects, createProject, updateProjectStatus, deleteProject, ProjectStatus, CreateProjectData } from '../api/projects';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDate } from '../utils/dateFormat';

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

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const activeProjects = projects.filter(p => p.status === 'active');
  const planningProjects = projects.filter(p => p.status === 'planning');

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
            <div className="text-2xl font-bold">{projects.filter(p => p.status === 'completed').length}</div>
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
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="folder" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('projects.noProjects')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <div key={project.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
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
                        <li><button onClick={() => statusMutation.mutate({ id: project.id, status: 'active' })}>{t('projects.markActive')}</button></li>
                      )}
                      {project.status === 'active' && (
                        <li><button onClick={() => statusMutation.mutate({ id: project.id, status: 'completed' })}>{t('projects.markCompleted')}</button></li>
                      )}
                      <li><button onClick={() => statusMutation.mutate({ id: project.id, status: 'archived' })}>{t('projects.archive')}</button></li>
                      <li className="text-error"><button onClick={() => {
                        if (confirm(t('projects.confirmDelete'))) {
                          deleteMutation.mutate(project.id);
                        }
                      }}>{t('common.delete')}</button></li>
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
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
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
