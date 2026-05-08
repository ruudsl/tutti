import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Icon } from './Icon';
import {
  getTaskTemplates,
  applyTaskTemplate,
  createTaskFromTemplate,
  TaskTemplate,
  TaskList,
  TaskPriority,
} from '../api/tasks';
import { showSuccess, showError } from '../utils/toast';

interface TaskTemplatesDialogProps {
  taskLists: TaskList[];
  onClose: () => void;
  onTasksCreated?: () => void;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-base-content/50',
  medium: 'text-info',
  high: 'text-warning',
  urgent: 'text-error',
};

export function TaskTemplatesDialog({ taskLists, onClose, onTasksCreated }: TaskTemplatesDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState('');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['task-templates'],
    queryFn: getTaskTemplates,
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: (templateId: string) => createTaskFromTemplate(templateId, {
      title: customTitle || undefined,
    }),
    onSuccess: () => {
      showSuccess(t('tasks.taskCreatedFromTemplate'));
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-lists'] });
      queryClient.invalidateQueries({ queryKey: ['task-summary'] });
      onTasksCreated?.();
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorCreateTemplate'));
    },
  });

  const handleCreateTask = () => {
    if (!selectedTemplate) return;
    createFromTemplateMutation.mutate(selectedTemplate.id);
  };

  return (
    <Modal onClose={onClose} size="medium" title={t('tasks.templates')}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <Icon name="clipboard" size={48} className="mx-auto opacity-50 mb-4" />
            <p className="text-base-content/70">{t('tasks.noTemplates')}</p>
          </div>
        ) : !selectedTemplate ? (
          <div className="space-y-2">
            <p className="text-sm text-base-content/70 mb-4">{t('tasks.useTemplate')}</p>
            {templates.map((template) => (
              <div
                key={template.id}
                className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
                onClick={() => setSelectedTemplate(template)}
              >
                <div className="card-body p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon name="clipboard" size={20} className="text-primary" />
                      <div>
                        <h4 className="font-medium">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-base-content/60">{template.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${PRIORITY_COLORS[template.priority]}`}>
                        {t(`tasks.priority.${template.priority}`)}
                      </span>
                      {template.checklistItems.length > 0 && (
                        <span className="badge badge-sm badge-ghost">
                          {template.checklistItems.length} {t('tasks.checklist').toLowerCase()}
                        </span>
                      )}
                      <Icon name="chevronRight" size={16} className="text-base-content/50" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Back button */}
            <button
              className="btn btn-ghost btn-sm gap-1"
              onClick={() => setSelectedTemplate(null)}
            >
              <Icon name="chevronLeft" size={16} />
              {t('common.back')}
            </button>

            {/* Template details */}
            <div className="card bg-base-200 p-4">
              <h4 className="font-semibold text-lg">{selectedTemplate.name}</h4>
              {selectedTemplate.description && (
                <p className="text-base-content/70 mt-1">{selectedTemplate.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className={PRIORITY_COLORS[selectedTemplate.priority]}>
                  {t(`tasks.priority.${selectedTemplate.priority}`)}
                </span>
                {selectedTemplate.listName && (
                  <span
                    className="badge badge-sm"
                    style={{ backgroundColor: selectedTemplate.listColor || undefined }}
                  >
                    {selectedTemplate.listName}
                  </span>
                )}
              </div>
            </div>

            {/* Checklist preview */}
            {selectedTemplate.checklistItems.length > 0 && (
              <div>
                <h5 className="font-medium mb-2">{t('tasks.checklistItems')}</h5>
                <ul className="list-disc list-inside text-sm text-base-content/70 space-y-1">
                  {selectedTemplate.checklistItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Options */}
            <div className="divider" />

            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('tasks.list')}</span>
              </label>
              <select
                className="select select-bordered"
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
              >
                <option value="">{selectedTemplate.listName || t('tasks.noList')}</option>
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('tasks.taskTitle')} ({t('common.optional')})</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                placeholder={selectedTemplate.name}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <button className="btn btn-ghost" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateSingleTask}
                disabled={applyMutation.isPending || createFromTemplateMutation.isPending}
              >
                {createFromTemplateMutation.isPending ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <>
                    <Icon name="plus" size={16} className="mr-1" />
                    {t('tasks.createFromTemplate')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default TaskTemplatesDialog;
