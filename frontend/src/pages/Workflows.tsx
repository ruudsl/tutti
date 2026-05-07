import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from '../components/Icon';
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  runWorkflow,
  getWorkflowExecutions,
  Workflow,
  CreateWorkflowData,
} from '../api/workflows';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';

const TRIGGER_TYPE_ICONS: Record<string, IconName> = {
  schedule: 'clock',
  event: 'warning',
  date_field: 'calendar',
  manual: 'play',
};

const ACTION_TYPE_ICONS: Record<string, IconName> = {
  send_email: 'envelope',
  send_notification: 'bell',
  create_task: 'clipboard',
  update_field: 'pencil',
  add_to_group: 'users',
  remove_from_group: 'users',
  webhook: 'globe',
  delay: 'clock',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'badge-warning',
  running: 'badge-info',
  completed: 'badge-success',
  failed: 'badge-error',
};

export default function Workflows() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.workflows');
  const queryClient = useQueryClient();

  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExecutionsModal, setShowExecutionsModal] = useState(false);

  const [formData, setFormData] = useState<CreateWorkflowData>({
    name: '',
    description: '',
    isActive: true,
    runOncePerEntity: false,
    triggers: [{ triggerType: 'manual' }],
    actions: [{ actionType: 'send_notification', actionOrder: 0, config: {} }],
  });

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: getWorkflows,
  });

  const { data: workflowDetail } = useQuery({
    queryKey: ['workflow', selectedWorkflow?.id],
    queryFn: () => selectedWorkflow ? getWorkflow(selectedWorkflow.id) : null,
    enabled: !!selectedWorkflow,
  });

  const { data: executions } = useQuery({
    queryKey: ['workflow-executions', selectedWorkflow?.id],
    queryFn: () => selectedWorkflow ? getWorkflowExecutions(selectedWorkflow.id) : null,
    enabled: !!selectedWorkflow && showExecutionsModal,
  });

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('workflows.created'));
      setShowCreateModal(false);
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateWorkflowData> }) => updateWorkflow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', selectedWorkflow?.id] });
      showSuccess(t('workflows.updated'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorUpdate'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('workflows.deleted'));
      setSelectedWorkflow(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorDelete'));
    },
  });

  const runMutation = useMutation({
    mutationFn: runWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions', selectedWorkflow?.id] });
      showSuccess(t('workflows.executed'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorRun'));
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
      runOncePerEntity: false,
      triggers: [{ triggerType: 'manual' }],
      actions: [{ actionType: 'send_notification', actionOrder: 0, config: {} }],
    });
  };

  const toggleActive = (workflow: Workflow) => {
    updateMutation.mutate({ id: workflow.id, data: { isActive: !workflow.isActive } });
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('workflows.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header flex justify-between items-center mb-4">
        <h1>{t('workflows.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" className="w-4 h-4 mr-2" />
          {t('workflows.add')}
        </button>
      </div>

      <div className="alert alert-info mb-4">
        <Icon name="info" className="w-5 h-5" />
        <span>{t('workflows.description')}</span>
      </div>

      {workflows.length === 0 ? (
        <div className="card p-8 text-center">
          <Icon name="settings" className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
          <p className="text-base-content/60">{t('workflows.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedWorkflow(workflow)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="card-title">
                      {workflow.name}
                      <span className={`badge ${workflow.isActive ? 'badge-success' : 'badge-ghost'} ml-2`}>
                        {workflow.isActive ? t('workflows.active') : t('workflows.inactive')}
                      </span>
                    </h3>
                    {workflow.description && (
                      <p className="text-sm text-base-content/70 mt-1">{workflow.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => toggleActive(workflow)}
                    >
                      <Icon name={workflow.isActive ? 'pause' : 'play'} className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => runMutation.mutate(workflow.id)}
                      disabled={!workflow.isActive || runMutation.isPending}
                    >
                      <Icon name="play" className="w-4 h-4 mr-1" />
                      {t('workflows.run')}
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 mt-3 text-sm text-base-content/60">
                  <span className="flex items-center gap-1">
                    <Icon name="warning" className="w-4 h-4" />
                    {t('workflows.triggers', { count: workflow.triggerCount })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="play" className="w-4 h-4" />
                    {t('workflows.actions', { count: workflow.actionCount })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="chart" className="w-4 h-4" />
                    {t('workflows.executions', { count: workflow.executionCount })}
                  </span>
                  {workflow.failedCount > 0 && (
                    <span className="flex items-center gap-1 text-error">
                      <Icon name="warning" className="w-4 h-4" />
                      {t('workflows.failed', { count: workflow.failedCount })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedWorkflow && workflowDetail && (
        <Modal onClose={() => setSelectedWorkflow(null)} title={workflowDetail.name} size="large">
          <div className="space-y-6">
            {workflowDetail.description && <p>{workflowDetail.description}</p>}

            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Icon name="warning" className="w-4 h-4" />
                {t('workflows.triggersTitle')}
              </h4>
              <div className="space-y-2">
                {workflowDetail.triggers.map((trigger) => (
                  <div key={trigger.id} className="flex items-center gap-2 p-2 rounded bg-base-200">
                    <Icon name={TRIGGER_TYPE_ICONS[trigger.triggerType] || 'circle'} className="w-4 h-4" />
                    <span>{t(`workflows.triggerType.${trigger.triggerType}`)}</span>
                    {trigger.eventName && <span className="badge badge-sm">{trigger.eventName}</span>}
                    {trigger.scheduleCron && <code className="text-xs bg-base-300 px-1 rounded">{trigger.scheduleCron}</code>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Icon name="play" className="w-4 h-4" />
                {t('workflows.actionsTitle')}
              </h4>
              <div className="space-y-2">
                {workflowDetail.actions.map((action, idx) => (
                  <div key={action.id} className="flex items-center gap-2 p-2 rounded bg-base-200">
                    <span className="badge badge-sm badge-outline">{idx + 1}</span>
                    <Icon name={ACTION_TYPE_ICONS[action.actionType] || 'circle'} className="w-4 h-4" />
                    <span>{t(`workflows.actionType.${action.actionType}`)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => runMutation.mutate(selectedWorkflow.id)}
                disabled={!workflowDetail.isActive || runMutation.isPending}
              >
                <Icon name="play" className="w-4 h-4 mr-1" />
                {t('workflows.run')}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowExecutionsModal(true)}
              >
                <Icon name="clipboard" className="w-4 h-4 mr-1" />
                {t('workflows.viewExecutions')}
              </button>
              <button
                className="btn btn-error btn-outline btn-sm"
                onClick={() => {
                  if (confirm(t('workflows.confirmDelete'))) {
                    deleteMutation.mutate(selectedWorkflow.id);
                  }
                }}
              >
                <Icon name="trash" className="w-4 h-4 mr-1" />
                {t('common.delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Executions Modal */}
      {showExecutionsModal && <Modal onClose={() => setShowExecutionsModal(false)} title={t('workflows.executionHistory')} size="large">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {!executions?.executions.length ? (
            <p className="text-base-content/60 text-center py-4">{t('workflows.noExecutions')}</p>
          ) : (
            executions.executions.map((execution) => (
              <div key={execution.id} className="flex justify-between items-center p-3 rounded bg-base-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-sm ${STATUS_COLORS[execution.status]}`}>
                      {t(`workflows.status.${execution.status}`)}
                    </span>
                    <span className="text-sm">
                      {t(`workflows.triggeredBy.${execution.triggeredBy}`)}
                      {execution.triggeredByName && ` (${execution.triggeredByName})`}
                    </span>
                  </div>
                  <div className="text-xs text-base-content/60 mt-1">
                    {formatDateTime(execution.createdAt)}
                    {execution.errorMessage && (
                      <span className="text-error ml-2">{execution.errorMessage}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>}

      {/* Create Modal */}
      {showCreateModal && <Modal onClose={() => { setShowCreateModal(false); resetForm(); }} title={t('workflows.add')} size="large">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">{t('workflows.name')} *</span></label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">{t('workflows.descriptionLabel')}</span></label>
            <textarea
              className="textarea textarea-bordered"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">{t('workflows.trigger')}</span></label>
            <select
              className="select select-bordered"
              value={formData.triggers[0]?.triggerType || 'manual'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                triggers: [{ triggerType: e.target.value as any }]
              }))}
            >
              <option value="manual">{t('workflows.triggerType.manual')}</option>
              <option value="event">{t('workflows.triggerType.event')}</option>
              <option value="schedule">{t('workflows.triggerType.schedule')}</option>
              <option value="date_field">{t('workflows.triggerType.date_field')}</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">{t('workflows.action')}</span></label>
            <select
              className="select select-bordered"
              value={formData.actions[0]?.actionType || 'send_notification'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                actions: [{ actionType: e.target.value as any, actionOrder: 0, config: {} }]
              }))}
            >
              <option value="send_notification">{t('workflows.actionType.send_notification')}</option>
              <option value="send_email">{t('workflows.actionType.send_email')}</option>
              <option value="create_task">{t('workflows.actionType.create_task')}</option>
            </select>
          </div>

          <div className="flex gap-4">
            <label className="label cursor-pointer gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              />
              <span className="label-text">{t('workflows.activateImmediately')}</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowCreateModal(false); resetForm(); }}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}
