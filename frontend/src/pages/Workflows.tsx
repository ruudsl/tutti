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
  addWorkflowTrigger,
  removeWorkflowTrigger,
  updateWorkflowTrigger,
  addWorkflowAction,
  removeWorkflowAction,
  updateWorkflowAction,
  Workflow,
  WorkflowTrigger,
  WorkflowAction,
  CreateWorkflowData,
} from '../api/workflows';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useConfirm } from '../hooks/useConfirm';
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
  const confirmDialog = useConfirm();
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
    queryFn: () => (selectedWorkflow ? getWorkflow(selectedWorkflow.id) : null),
    enabled: !!selectedWorkflow,
  });

  const { data: executions } = useQuery({
    queryKey: ['workflow-executions', selectedWorkflow?.id],
    queryFn: () => (selectedWorkflow ? getWorkflowExecutions(selectedWorkflow.id) : null),
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
                    <button className="btn btn-sm btn-outline" onClick={() => toggleActive(workflow)}>
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
        <WorkflowDetailModal
          workflow={workflowDetail}
          onClose={() => setSelectedWorkflow(null)}
          onRun={() => runMutation.mutate(selectedWorkflow.id)}
          onDelete={async () => {
            if (await confirmDialog(t('workflows.confirmDelete'))) {
              deleteMutation.mutate(selectedWorkflow.id);
            }
          }}
          onViewExecutions={() => setShowExecutionsModal(true)}
          isRunning={runMutation.isPending}
        />
      )}

      {/* Executions Modal */}
      {showExecutionsModal && (
        <Modal onClose={() => setShowExecutionsModal(false)} title={t('workflows.executionHistory')} size="large">
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
                      {execution.errorMessage && <span className="text-error ml-2">{execution.errorMessage}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          onClose={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          title={t('workflows.add')}
          size="large"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(formData);
            }}
            className="space-y-4"
          >
            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('workflows.name')} *</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('workflows.descriptionLabel')}</span>
              </label>
              <textarea
                className="textarea textarea-bordered"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('workflows.trigger')}</span>
              </label>
              <select
                className="select select-bordered"
                value={formData.triggers[0]?.triggerType || 'manual'}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    triggers: [{ triggerType: e.target.value as any }],
                  }))
                }
              >
                <option value="manual">{t('workflows.triggerType.manual')}</option>
                <option value="event">{t('workflows.triggerType.event')}</option>
                <option value="schedule">{t('workflows.triggerType.schedule')}</option>
                <option value="date_field">{t('workflows.triggerType.date_field')}</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('workflows.action')}</span>
              </label>
              <select
                className="select select-bordered"
                value={formData.actions[0]?.actionType || 'send_notification'}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    actions: [{ actionType: e.target.value as any, actionOrder: 0, config: {} }],
                  }))
                }
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span className="label-text">{t('workflows.activateImmediately')}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

interface WorkflowDetailModalProps {
  workflow: {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    triggers: WorkflowTrigger[];
    actions: WorkflowAction[];
  };
  onClose: () => void;
  onRun: () => void;
  onDelete: () => void;
  onViewExecutions: () => void;
  isRunning: boolean;
}

function WorkflowDetailModal({
  workflow,
  onClose,
  onRun,
  onDelete,
  onViewExecutions,
  isRunning,
}: WorkflowDetailModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();

  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [showAddTrigger, setShowAddTrigger] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);

  const [triggerFormData, setTriggerFormData] = useState<Partial<WorkflowTrigger>>({});
  const [actionFormData, setActionFormData] = useState<Partial<WorkflowAction>>({});

  const addTriggerMutation = useMutation({
    mutationFn: (data: Omit<WorkflowTrigger, 'id' | 'isActive'>) => addWorkflowTrigger(workflow.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.triggerAdded'));
      setShowAddTrigger(false);
      setTriggerFormData({});
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorAddTrigger'));
    },
  });

  const updateTriggerMutation = useMutation({
    mutationFn: ({
      triggerId,
      updates,
    }: {
      triggerId: string;
      updates: Partial<Omit<WorkflowTrigger, 'id' | 'isActive'>>;
    }) => updateWorkflowTrigger(workflow.id, triggerId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.triggerUpdated'));
      setEditingTriggerId(null);
      setTriggerFormData({});
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorUpdateTrigger'));
    },
  });

  const removeTriggerMutation = useMutation({
    mutationFn: (triggerId: string) => removeWorkflowTrigger(workflow.id, triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.triggerRemoved'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorRemoveTrigger'));
    },
  });

  const addActionMutation = useMutation({
    mutationFn: (data: Omit<WorkflowAction, 'id' | 'isActive'>) => addWorkflowAction(workflow.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.actionAdded'));
      setShowAddAction(false);
      setActionFormData({});
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorAddAction'));
    },
  });

  const updateActionMutation = useMutation({
    mutationFn: ({
      actionId,
      updates,
    }: {
      actionId: string;
      updates: Partial<Omit<WorkflowAction, 'id' | 'isActive'>>;
    }) => updateWorkflowAction(workflow.id, actionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.actionUpdated'));
      setEditingActionId(null);
      setActionFormData({});
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorUpdateAction'));
    },
  });

  const removeActionMutation = useMutation({
    mutationFn: (actionId: string) => removeWorkflowAction(workflow.id, actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
      showSuccess(t('workflows.actionRemoved'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('workflows.errorRemoveAction'));
    },
  });

  const startEditTrigger = (trigger: WorkflowTrigger) => {
    setEditingTriggerId(trigger.id);
    setTriggerFormData({
      triggerType: trigger.triggerType,
      eventName: trigger.eventName || '',
      scheduleCron: trigger.scheduleCron || '',
      dateFieldEntity: trigger.dateFieldEntity || '',
      dateFieldName: trigger.dateFieldName || '',
      daysBefore: trigger.daysBefore,
      daysAfter: trigger.daysAfter,
      timeOfDay: trigger.timeOfDay || '',
      conditions: trigger.conditions,
    });
  };

  const startEditAction = (action: WorkflowAction) => {
    setEditingActionId(action.id);
    setActionFormData({
      actionType: action.actionType,
      actionOrder: action.actionOrder,
      config: action.config,
      conditions: action.conditions,
    });
  };

  const renderTriggerForm = (isNew: boolean) => (
    <div className="p-3 rounded bg-base-200 space-y-3">
      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('workflows.triggerTypeLabel')}</span>
        </label>
        <select
          className="select select-bordered select-sm"
          value={triggerFormData.triggerType || 'manual'}
          onChange={(e) =>
            setTriggerFormData({ ...triggerFormData, triggerType: e.target.value as WorkflowTrigger['triggerType'] })
          }
        >
          <option value="manual">{t('workflows.triggerType.manual')}</option>
          <option value="event">{t('workflows.triggerType.event')}</option>
          <option value="schedule">{t('workflows.triggerType.schedule')}</option>
          <option value="date_field">{t('workflows.triggerType.date_field')}</option>
        </select>
      </div>

      {triggerFormData.triggerType === 'event' && (
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('workflows.eventName')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered input-sm"
            placeholder="e.g., member.created"
            value={triggerFormData.eventName || ''}
            onChange={(e) => setTriggerFormData({ ...triggerFormData, eventName: e.target.value })}
          />
        </div>
      )}

      {triggerFormData.triggerType === 'schedule' && (
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('workflows.cronExpression')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered input-sm"
            placeholder="0 9 * * 1"
            value={triggerFormData.scheduleCron || ''}
            onChange={(e) => setTriggerFormData({ ...triggerFormData, scheduleCron: e.target.value })}
          />
        </div>
      )}

      {triggerFormData.triggerType === 'date_field' && (
        <>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.dateFieldEntity')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder="e.g., event"
              value={triggerFormData.dateFieldEntity || ''}
              onChange={(e) => setTriggerFormData({ ...triggerFormData, dateFieldEntity: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.dateFieldName')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder="e.g., startDate"
              value={triggerFormData.dateFieldName || ''}
              onChange={(e) => setTriggerFormData({ ...triggerFormData, dateFieldName: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">{t('workflows.daysBefore')}</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm"
                value={triggerFormData.daysBefore ?? ''}
                onChange={(e) =>
                  setTriggerFormData({
                    ...triggerFormData,
                    daysBefore: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">{t('workflows.daysAfter')}</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm"
                value={triggerFormData.daysAfter ?? ''}
                onChange={(e) =>
                  setTriggerFormData({
                    ...triggerFormData,
                    daysAfter: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              />
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (isNew) {
              setShowAddTrigger(false);
            } else {
              setEditingTriggerId(null);
            }
            setTriggerFormData({});
          }}
        >
          {t('common.cancel')}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (isNew) {
              addTriggerMutation.mutate({
                triggerType: triggerFormData.triggerType || 'manual',
                eventName: triggerFormData.eventName,
                scheduleCron: triggerFormData.scheduleCron,
                dateFieldEntity: triggerFormData.dateFieldEntity,
                dateFieldName: triggerFormData.dateFieldName,
                daysBefore: triggerFormData.daysBefore,
                daysAfter: triggerFormData.daysAfter,
                timeOfDay: triggerFormData.timeOfDay,
                conditions: triggerFormData.conditions,
              });
            } else {
              updateTriggerMutation.mutate({
                triggerId: editingTriggerId!,
                updates: {
                  triggerType: triggerFormData.triggerType,
                  eventName: triggerFormData.eventName,
                  scheduleCron: triggerFormData.scheduleCron,
                  dateFieldEntity: triggerFormData.dateFieldEntity,
                  dateFieldName: triggerFormData.dateFieldName,
                  daysBefore: triggerFormData.daysBefore,
                  daysAfter: triggerFormData.daysAfter,
                  timeOfDay: triggerFormData.timeOfDay,
                  conditions: triggerFormData.conditions,
                },
              });
            }
          }}
          disabled={addTriggerMutation.isPending || updateTriggerMutation.isPending}
        >
          {addTriggerMutation.isPending || updateTriggerMutation.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );

  const renderActionForm = (isNew: boolean) => (
    <div className="p-3 rounded bg-base-200 space-y-3">
      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('workflows.actionTypeLabel')}</span>
        </label>
        <select
          className="select select-bordered select-sm"
          value={actionFormData.actionType || 'send_notification'}
          onChange={(e) =>
            setActionFormData({ ...actionFormData, actionType: e.target.value as WorkflowAction['actionType'] })
          }
        >
          <option value="send_notification">{t('workflows.actionType.send_notification')}</option>
          <option value="send_email">{t('workflows.actionType.send_email')}</option>
          <option value="create_task">{t('workflows.actionType.create_task')}</option>
          <option value="update_field">{t('workflows.actionType.update_field')}</option>
          <option value="add_to_group">{t('workflows.actionType.add_to_group')}</option>
          <option value="remove_from_group">{t('workflows.actionType.remove_from_group')}</option>
          <option value="webhook">{t('workflows.actionType.webhook')}</option>
          <option value="delay">{t('workflows.actionType.delay')}</option>
        </select>
      </div>

      {actionFormData.actionType === 'send_email' && (
        <>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.emailSubject')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              value={((actionFormData.config as Record<string, unknown>)?.subject as string) || ''}
              onChange={(e) =>
                setActionFormData({
                  ...actionFormData,
                  config: { ...(actionFormData.config || {}), subject: e.target.value },
                })
              }
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.emailTemplate')}</span>
            </label>
            <textarea
              className="textarea textarea-bordered textarea-sm"
              rows={3}
              value={((actionFormData.config as Record<string, unknown>)?.template as string) || ''}
              onChange={(e) =>
                setActionFormData({
                  ...actionFormData,
                  config: { ...(actionFormData.config || {}), template: e.target.value },
                })
              }
            />
          </div>
        </>
      )}

      {actionFormData.actionType === 'send_notification' && (
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('workflows.notificationMessage')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            rows={2}
            value={((actionFormData.config as Record<string, unknown>)?.message as string) || ''}
            onChange={(e) =>
              setActionFormData({
                ...actionFormData,
                config: { ...(actionFormData.config || {}), message: e.target.value },
              })
            }
          />
        </div>
      )}

      {actionFormData.actionType === 'webhook' && (
        <>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.webhookUrl')}</span>
            </label>
            <input
              type="url"
              className="input input-bordered input-sm"
              value={((actionFormData.config as Record<string, unknown>)?.url as string) || ''}
              onChange={(e) =>
                setActionFormData({
                  ...actionFormData,
                  config: { ...(actionFormData.config || {}), url: e.target.value },
                })
              }
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('workflows.webhookMethod')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={((actionFormData.config as Record<string, unknown>)?.method as string) || 'POST'}
              onChange={(e) =>
                setActionFormData({
                  ...actionFormData,
                  config: { ...(actionFormData.config || {}), method: e.target.value },
                })
              }
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        </>
      )}

      {actionFormData.actionType === 'delay' && (
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('workflows.delayMinutes')}</span>
          </label>
          <input
            type="number"
            className="input input-bordered input-sm"
            min="1"
            value={((actionFormData.config as Record<string, unknown>)?.minutes as number) || ''}
            onChange={(e) =>
              setActionFormData({
                ...actionFormData,
                config: { ...(actionFormData.config || {}), minutes: parseInt(e.target.value) || 0 },
              })
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (isNew) {
              setShowAddAction(false);
            } else {
              setEditingActionId(null);
            }
            setActionFormData({});
          }}
        >
          {t('common.cancel')}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (isNew) {
              addActionMutation.mutate({
                actionType: actionFormData.actionType || 'send_notification',
                actionOrder: workflow.actions.length,
                config: actionFormData.config || {},
                conditions: actionFormData.conditions,
              });
            } else {
              updateActionMutation.mutate({
                actionId: editingActionId!,
                updates: {
                  actionType: actionFormData.actionType,
                  actionOrder: actionFormData.actionOrder,
                  config: actionFormData.config,
                  conditions: actionFormData.conditions,
                },
              });
            }
          }}
          disabled={addActionMutation.isPending || updateActionMutation.isPending}
        >
          {addActionMutation.isPending || updateActionMutation.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} title={workflow.name} size="large">
      <div className="space-y-6">
        {workflow.description && <p>{workflow.description}</p>}

        {/* Triggers Section */}
        <div>
          <div className="page-header">
            <h4 className="font-semibold flex items-center gap-2">
              <Icon name="warning" className="w-4 h-4" />
              {t('workflows.triggersTitle')}
            </h4>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setShowAddTrigger(true);
                setTriggerFormData({ triggerType: 'manual' });
              }}
            >
              <Icon name="plus" className="w-4 h-4" />
              {t('workflows.addTrigger')}
            </button>
          </div>

          {showAddTrigger && renderTriggerForm(true)}

          <div className="space-y-2">
            {workflow.triggers.map((trigger) => (
              <div key={trigger.id}>
                {editingTriggerId === trigger.id ? (
                  renderTriggerForm(false)
                ) : (
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-base-200">
                    <div className="flex items-center gap-2 flex-1">
                      <Icon name={TRIGGER_TYPE_ICONS[trigger.triggerType] || 'circle'} className="w-4 h-4" />
                      <span>{t(`workflows.triggerType.${trigger.triggerType}`)}</span>
                      {trigger.eventName && <span className="badge badge-sm">{trigger.eventName}</span>}
                      {trigger.scheduleCron && (
                        <code className="text-xs bg-base-300 px-1 rounded">{trigger.scheduleCron}</code>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => startEditTrigger(trigger)}
                        title={t('common.edit')}
                      >
                        <Icon name="pencil" className="w-3 h-3" />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={async () => {
                          if (await confirmDialog(t('workflows.confirmRemoveTrigger'))) {
                            removeTriggerMutation.mutate(trigger.id);
                          }
                        }}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {workflow.triggers.length === 0 && !showAddTrigger && (
              <p className="text-base-content/60 text-sm">{t('workflows.noTriggers')}</p>
            )}
          </div>
        </div>

        {/* Actions Section */}
        <div>
          <div className="page-header">
            <h4 className="font-semibold flex items-center gap-2">
              <Icon name="play" className="w-4 h-4" />
              {t('workflows.actionsTitle')}
            </h4>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setShowAddAction(true);
                setActionFormData({ actionType: 'send_notification', config: {} });
              }}
            >
              <Icon name="plus" className="w-4 h-4" />
              {t('workflows.addAction')}
            </button>
          </div>

          {showAddAction && renderActionForm(true)}

          <div className="space-y-2">
            {workflow.actions.map((action, idx) => (
              <div key={action.id}>
                {editingActionId === action.id ? (
                  renderActionForm(false)
                ) : (
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-base-200">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="badge badge-sm badge-outline">{idx + 1}</span>
                      <Icon name={ACTION_TYPE_ICONS[action.actionType] || 'circle'} className="w-4 h-4" />
                      <span>{t(`workflows.actionType.${action.actionType}`)}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => startEditAction(action)}
                        title={t('common.edit')}
                      >
                        <Icon name="pencil" className="w-3 h-3" />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={async () => {
                          if (await confirmDialog(t('workflows.confirmRemoveAction'))) {
                            removeActionMutation.mutate(action.id);
                          }
                        }}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {workflow.actions.length === 0 && !showAddAction && (
              <p className="text-base-content/60 text-sm">{t('workflows.noActions')}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <button className="btn btn-primary btn-sm" onClick={onRun} disabled={!workflow.isActive || isRunning}>
            <Icon name="play" className="w-4 h-4 mr-1" />
            {t('workflows.run')}
          </button>
          <button className="btn btn-outline btn-sm" onClick={onViewExecutions}>
            <Icon name="clipboard" className="w-4 h-4 mr-1" />
            {t('workflows.viewExecutions')}
          </button>
          <button className="btn btn-error btn-outline btn-sm" onClick={onDelete}>
            <Icon name="trash" className="w-4 h-4 mr-1" />
            {t('common.delete')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
