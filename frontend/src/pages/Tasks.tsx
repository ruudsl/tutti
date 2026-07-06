import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon, IconName } from '../components/Icon';
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTaskLists,
  createTaskList,
  updateTaskList,
  deleteTaskList,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addTaskComment,
  deleteTaskComment,
  Task,
  TaskDetail,
  TaskStatus,
  TaskPriority,
  TaskList,
  CreateTaskData,
} from '../api/tasks';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';
import { TaskTemplatesDialog } from '../components/TaskTemplatesDialog';
import { TaskSummary } from '../components/TaskSummary';

const STATUS_ICONS: Record<TaskStatus, IconName> = {
  todo: 'circle',
  in_progress: 'clock',
  review: 'eye',
  done: 'checkCircle',
  cancelled: 'close',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'badge-ghost',
  in_progress: 'badge-info',
  review: 'badge-warning',
  done: 'badge-success',
  cancelled: 'badge-error',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-base-content/50',
  medium: 'text-info',
  high: 'text-warning',
  urgent: 'text-error',
};

const PRIORITY_ICONS: Record<TaskPriority, IconName> = {
  low: 'chevronDown',
  medium: 'chevronRight',
  high: 'chevronUp',
  urgent: 'warning',
};

export default function Tasks() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.tasks');
  const queryClient = useQueryClient();

  // Filters live in the URL so filtered views can be linked/bookmarked;
  // default values are omitted from the URL to keep it clean.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterStatus = (searchParams.get('status') ?? '') as TaskStatus | '';
  const filterPriority = (searchParams.get('priority') ?? '') as TaskPriority | '';
  const filterList = searchParams.get('list') ?? '';
  const filterAssignee = searchParams.get('assignee') ?? '';
  const searchTerm = searchParams.get('search') ?? '';
  const showCompleted = searchParams.get('completed') === '1';

  const setFilterParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const setFilterStatus = (value: TaskStatus | '') => setFilterParam('status', value);
  const setFilterPriority = (value: TaskPriority | '') => setFilterParam('priority', value);
  const setFilterList = (value: string) => setFilterParam('list', value);
  const setFilterAssignee = (value: string) => setFilterParam('assignee', value);
  const setSearchTerm = (value: string) => setFilterParam('search', value);
  const setShowCompleted = (value: boolean) => setFilterParam('completed', value ? '1' : '');

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showListsModal, setShowListsModal] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  const canManageLists = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', filterStatus, filterPriority, filterList, filterAssignee, searchTerm, showCompleted],
    queryFn: () =>
      getTasks({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        listId: filterList || undefined,
        assignedTo: filterAssignee || undefined,
        search: searchTerm || undefined,
        showCompleted,
      }),
  });

  const { data: taskLists = [] } = useQuery({
    queryKey: ['task-lists'],
    queryFn: getTaskLists,
  });

  const { data: taskDetail } = useQuery({
    queryKey: ['task', selectedTask?.id],
    queryFn: () => (selectedTask ? getTask(selectedTask.id) : null),
    enabled: !!selectedTask,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-lists'] });
      showSuccess(t('tasks.deleted'));
      setSelectedTask(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorDelete'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', selectedTask?.id] });
      queryClient.invalidateQueries({ queryKey: ['task-lists'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorUpdate'));
    },
  });

  const getStatusBadge = (status: TaskStatus) => (
    <span className={`badge ${STATUS_COLORS[status]} gap-1`}>
      <Icon name={STATUS_ICONS[status]} size={12} />
      {t(`tasks.status.${status}`)}
    </span>
  );

  const getPriorityIcon = (priority: TaskPriority) => (
    <span className={`${PRIORITY_COLORS[priority]}`} title={t(`tasks.priority.${priority}`)}>
      <Icon name={PRIORITY_ICONS[priority]} size={16} />
    </span>
  );

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('tasks.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm gap-2" onClick={() => setShowSummary(!showSummary)}>
            <Icon name="chart" size={16} />
            {showSummary ? t('common.hide') : t('common.show')} {t('tasks.statusSummary')}
          </button>
          <button className="btn btn-outline btn-sm gap-2" onClick={() => setShowTemplatesDialog(true)}>
            <Icon name="clipboard" size={16} />
            {t('tasks.templates')}
          </button>
          {canManageLists && (
            <button className="btn btn-outline btn-sm gap-2" onClick={() => setShowListsModal(true)}>
              <Icon name="folder" size={16} />
              {t('tasks.manageLists')}
            </button>
          )}
          <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={16} />
            {t('tasks.createTask')}
          </button>
        </div>
      </div>

      {/* Task Summary */}
      {showSummary && (
        <TaskSummary
          compact
          onTaskClick={(taskId) => {
            const task = tasks.find((t) => t.id === taskId);
            if (task) setSelectedTask(task);
          }}
        />
      )}

      {/* Filters */}
      <div className="card bg-base-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.filterStatus')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')}
            >
              <option value="">{t('common.all')}</option>
              <option value="todo">{t('tasks.status.todo')}</option>
              <option value="in_progress">{t('tasks.status.in_progress')}</option>
              <option value="review">{t('tasks.status.review')}</option>
              <option value="done">{t('tasks.status.done')}</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.filterPriority')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')}
            >
              <option value="">{t('common.all')}</option>
              <option value="urgent">{t('tasks.priority.urgent')}</option>
              <option value="high">{t('tasks.priority.high')}</option>
              <option value="medium">{t('tasks.priority.medium')}</option>
              <option value="low">{t('tasks.priority.low')}</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.filterList')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterList}
              onChange={(e) => setFilterList(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              <option value="none">{t('tasks.noList')}</option>
              {taskLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.filterAssignee')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              <option value="me">{t('tasks.assignedToMe')}</option>
              <option value="unassigned">{t('tasks.unassigned')}</option>
            </select>
          </div>

          <div className="form-control flex-1 min-w-[200px]">
            <label className="label">
              <span className="label-text">{t('common.search')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder={t('tasks.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="form-control self-end">
            <label className="label cursor-pointer gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              <span className="label-text">{t('tasks.showCompleted')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={5} />
      ) : tasks.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="checkCircle" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('tasks.noTasks')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedTask(task)}
            >
              <div className="card-body p-4">
                <div className="flex items-center gap-3">
                  {/* Priority indicator */}
                  {getPriorityIcon(task.priority)}

                  {/* Status checkbox */}
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={task.status === 'done'}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateMutation.mutate({
                        id: task.id,
                        data: { status: e.target.checked ? 'done' : 'todo' },
                      });
                    }}
                  />

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-medium ${task.status === 'done' ? 'line-through text-base-content/50' : ''}`}
                      >
                        {task.title}
                      </span>
                      {task.listName && (
                        <span className="badge badge-sm" style={{ backgroundColor: task.listColor || undefined }}>
                          {task.listName}
                        </span>
                      )}
                    </div>

                    {task.description && <p className="text-sm text-base-content/60 truncate">{task.description}</p>}

                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-base-content/50">
                      {task.dueDate && (
                        <span
                          className={`flex items-center gap-1 ${isOverdue(task.dueDate) && task.status !== 'done' ? 'text-error' : ''}`}
                        >
                          <Icon name="calendar" size={12} />
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {task.assignedToName && (
                        <span className="flex items-center gap-1">
                          <Icon name="user" size={12} />
                          {task.assignedToName}
                        </span>
                      )}
                      {task.checklistTotal > 0 && (
                        <span className="flex items-center gap-1">
                          <Icon name="checkCircle" size={12} />
                          {task.checklistDone}/{task.checklistTotal}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  {getStatusBadge(task.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && taskDetail && (
        <TaskDetailModal
          task={taskDetail}
          taskLists={taskLists}
          onClose={() => setSelectedTask(null)}
          onDelete={() => {
            if (confirm(t('tasks.confirmDelete'))) {
              deleteMutation.mutate(selectedTask.id);
            }
          }}
          onUpdate={(data) => {
            updateMutation.mutate({ id: selectedTask.id, data });
          }}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          taskLists={taskLists}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['task-lists'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Manage Lists Modal */}
      {showListsModal && (
        <ManageListsModal
          lists={taskLists}
          onClose={() => setShowListsModal(false)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['task-lists'] });
          }}
        />
      )}

      {/* Task Templates Dialog */}
      {showTemplatesDialog && (
        <TaskTemplatesDialog
          taskLists={taskLists}
          onClose={() => setShowTemplatesDialog(false)}
          onTasksCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['task-lists'] });
            queryClient.invalidateQueries({ queryKey: ['task-summary'] });
          }}
        />
      )}
    </div>
  );
}

// Task Detail Modal
function TaskDetailModal({
  task,
  taskLists,
  onClose,
  onDelete,
  onUpdate,
}: {
  task: TaskDetail;
  taskLists: TaskList[];
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (data: any) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newComment, setNewComment] = useState('');

  const checklistMutation = useMutation({
    mutationFn: (content: string) => addChecklistItem(task.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      setNewChecklistItem('');
    },
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) =>
      updateChecklistItem(task.id, itemId, { isCompleted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    },
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (itemId: string) => deleteChecklistItem(task.id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => addTaskComment(task.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      setNewComment('');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteTaskComment(task.id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    },
  });

  const statuses: TaskStatus[] = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
  const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

  return (
    <Modal onClose={onClose} size="large" title={task.title}>
      <div className="space-y-6">
        {/* Status and Priority */}
        <div className="flex flex-wrap gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.status.label')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={task.status}
              onChange={(e) => onUpdate({ status: e.target.value })}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {t(`tasks.status.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.priority.label')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={task.priority}
              onChange={(e) => onUpdate({ priority: e.target.value })}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {t(`tasks.priority.${p}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.list')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={task.taskListId || ''}
              onChange={(e) => onUpdate({ taskListId: e.target.value || null })}
            >
              <option value="">{t('tasks.noList')}</option>
              {taskLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <h4 className="font-semibold mb-2">{t('tasks.description')}</h4>
            <p className="text-base-content/80">{task.description}</p>
          </div>
        )}

        {/* Due date and time info */}
        <div className="flex flex-wrap gap-4 text-sm">
          {task.dueDate && (
            <div className="flex items-center gap-2">
              <Icon name="calendar" size={16} />
              <span>
                {t('tasks.dueDate')}: {formatDateTime(task.dueDate)}
              </span>
            </div>
          )}
          {task.assignedToName && (
            <div className="flex items-center gap-2">
              <Icon name="user" size={16} />
              <span>
                {t('tasks.assignedTo')}: {task.assignedToName}
              </span>
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <h4 className="font-semibold">{t('tasks.checklist')}</h4>

          {task.checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={item.isCompleted}
                onChange={(e) => toggleChecklistMutation.mutate({ itemId: item.id, isCompleted: e.target.checked })}
              />
              <span className={item.isCompleted ? 'line-through text-base-content/50' : ''}>{item.content}</span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => deleteChecklistMutation.mutate(item.id)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered input-sm flex-1"
              placeholder={t('tasks.addChecklistItem')}
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newChecklistItem.trim()) {
                  checklistMutation.mutate(newChecklistItem.trim());
                }
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (newChecklistItem.trim()) {
                  checklistMutation.mutate(newChecklistItem.trim());
                }
              }}
              disabled={!newChecklistItem.trim()}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-3 border-t pt-4">
          <h4 className="font-semibold">{t('tasks.comments')}</h4>

          {task.comments.length === 0 ? (
            <p className="text-sm text-base-content/60">{t('tasks.noComments')}</p>
          ) : (
            <div className="space-y-2">
              {task.comments.map((comment) => (
                <div key={comment.id} className="bg-base-200 p-3 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium">{comment.authorName}</span>
                      <span className="text-xs text-base-content/50 ml-2">{formatDateTime(comment.createdAt)}</span>
                    </div>
                    {comment.authorId === user?.id && (
                      <button className="btn btn-ghost btn-xs" onClick={() => deleteCommentMutation.mutate(comment.id)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{comment.content}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered flex-1"
              placeholder={t('tasks.addCommentPlaceholder')}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newComment.trim()) {
                  commentMutation.mutate(newComment.trim());
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                if (newComment.trim()) {
                  commentMutation.mutate(newComment.trim());
                }
              }}
              disabled={!newComment.trim()}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>

        {/* Delete button */}
        <div className="border-t pt-4">
          <button className="btn btn-error btn-sm" onClick={onDelete}>
            <Icon name="trash" size={14} className="mr-1" />
            {t('common.delete')}
          </button>
        </div>

        {/* Meta info */}
        <div className="text-xs text-base-content/50 border-t pt-2">
          {t('tasks.createdBy', { name: task.createdByName, date: formatDateTime(task.createdAt) })}
        </div>
      </div>
    </Modal>
  );
}

// Create Task Modal
function CreateTaskModal({
  taskLists,
  onClose,
  onSuccess,
}: {
  taskLists: TaskList[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateTaskData>({
    title: '',
    description: '',
    priority: 'medium',
  });

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      showSuccess(t('tasks.created'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorCreate'));
    },
  });

  const canSubmit = formData.title.trim();

  return (
    <Modal onClose={onClose} size="medium" title={t('tasks.createTask')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('tasks.taskTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={t('tasks.titlePlaceholder')}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('tasks.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={t('tasks.descriptionPlaceholder')}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.priority.label')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.priority}
              onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
            >
              <option value="low">{t('tasks.priority.low')}</option>
              <option value="medium">{t('tasks.priority.medium')}</option>
              <option value="high">{t('tasks.priority.high')}</option>
              <option value="urgent">{t('tasks.priority.urgent')}</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('tasks.list')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.taskListId || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, taskListId: e.target.value || undefined }))}
            >
              <option value="">{t('tasks.noList')}</option>
              {taskLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('tasks.dueDate')}</span>
          </label>
          <input
            type="datetime-local"
            className="input input-bordered"
            value={formData.dueDate ? formData.dueDate.slice(0, 16) : ''}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              }))
            }
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <Icon name="plus" size={16} className="mr-1" />
                {t('tasks.createTask')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Manage Lists Modal
function ManageListsModal({
  lists,
  onClose,
  onUpdate,
}: {
  lists: TaskList[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#3b82f6');
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const LIST_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#6b7280', // gray
  ];

  const createMutation = useMutation({
    mutationFn: () => createTaskList({ name: newListName, color: newListColor }),
    onSuccess: () => {
      showSuccess(t('tasks.listCreated'));
      setNewListName('');
      setNewListColor('#3b82f6');
      onUpdate();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorCreateList'));
    },
  });

  const updateListMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) => updateTaskList(id, data),
    onSuccess: () => {
      showSuccess(t('tasks.updated'));
      setEditingList(null);
      onUpdate();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorUpdate'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTaskList,
    onSuccess: () => {
      showSuccess(t('tasks.listDeleted'));
      onUpdate();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('tasks.errorDeleteList'));
    },
  });

  const startEditing = (list: TaskList) => {
    setEditingList(list);
    setEditName(list.name);
    setEditColor(list.color || '#3b82f6');
  };

  const saveEdit = () => {
    if (!editingList || !editName.trim()) return;
    updateListMutation.mutate({
      id: editingList.id,
      data: { name: editName, color: editColor },
    });
  };

  return (
    <Modal onClose={onClose} size="medium" title={t('tasks.manageLists')}>
      <div className="space-y-4">
        {lists.length === 0 ? (
          <p className="text-base-content/60">{t('tasks.noLists')}</p>
        ) : (
          <div className="space-y-2">
            {lists.map((list) => (
              <div key={list.id} className="p-3 bg-base-200 rounded-lg">
                {editingList?.id === list.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t('tasks.newListName')}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-base-content/60">{t('tasks.color')}:</span>
                      <div className="flex gap-1">
                        {LIST_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditColor(color)}
                            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: color,
                              borderColor: editColor === color ? 'var(--bc)' : 'transparent',
                            }}
                            aria-label={color}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingList(null)}>
                        {t('common.cancel')}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={saveEdit}
                        disabled={!editName.trim() || updateListMutation.isPending}
                      >
                        {updateListMutation.isPending ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          t('common.save')
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: list.color || '#6b7280' }}
                      />
                      <span className="font-medium">{list.name}</span>
                      <span className="text-sm text-base-content/60">
                        ({list.openCount}/{list.totalCount})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEditing(list)}
                        title={t('common.edit')}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (confirm(t('tasks.confirmDeleteList'))) {
                            deleteMutation.mutate(list.id);
                          }
                        }}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create new list */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered flex-1"
              placeholder={t('tasks.newListName')}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newListName.trim()) {
                  createMutation.mutate();
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => createMutation.mutate()}
              disabled={!newListName.trim() || createMutation.isPending}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-base-content/60">{t('tasks.color')}:</span>
            <div className="flex gap-1">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewListColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: newListColor === color ? 'var(--bc)' : 'transparent',
                  }}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
