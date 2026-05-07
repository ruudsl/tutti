import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon, IconName } from '../components/Icon';
import {
  getPolls,
  getPoll,
  createPoll,
  changePollStatus,
  deletePoll,
  submitVote,
  retractVote,
  addPollComment,
  deletePollComment,
  sendPollReminder,
  createRehearsalFromPoll,
  Poll,
  PollDetail,
  PollStatus,
  PollType,
  CreatePollData,
} from '../api/polls';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';

const STATUS_ICONS: Record<PollStatus, IconName> = {
  draft: 'fileText',
  active: 'play',
  closed: 'lock',
  archived: 'archive',
};

const STATUS_COLORS: Record<PollStatus, string> = {
  draft: 'badge-secondary',
  active: 'badge-success',
  closed: 'badge-warning',
  archived: 'badge-error',
};

const POLL_TYPE_LABELS: Record<PollType, string> = {
  single: 'polls.typeSingle',
  multiple: 'polls.typeMultiple',
  ranked: 'polls.typeRanked',
};

export default function Polls() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.polls');
  const queryClient = useQueryClient();

  const [filterStatus, setFilterStatus] = useState<PollStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);

  const canCreate = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  const { data: polls = [], isLoading } = useQuery({
    queryKey: ['polls', filterStatus, searchTerm],
    queryFn: () => getPolls({
      status: filterStatus || undefined,
      search: searchTerm || undefined,
    }),
  });

  const { data: pollDetail } = useQuery({
    queryKey: ['poll', selectedPoll?.id],
    queryFn: () => selectedPoll ? getPoll(selectedPoll.id) : null,
    enabled: !!selectedPoll,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePoll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      showSuccess(t('polls.deleted'));
      setSelectedPoll(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorDelete'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PollStatus }) => changePollStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['poll', selectedPoll?.id] });
      showSuccess(t('polls.statusChanged'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorStatus'));
    },
  });

  const getStatusBadge = (status: PollStatus) => (
    <span className={`badge ${STATUS_COLORS[status]} gap-1`}>
      <Icon name={STATUS_ICONS[status]} size={12} />
      {t(`polls.status.${status}`)}
    </span>
  );

  const getPollTypeLabel = (type: PollType) => t(POLL_TYPE_LABELS[type]);

  const filteredPolls = polls;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('polls.title')}</h1>
        {canCreate && (
          <button
            className="btn btn-primary gap-2"
            onClick={() => setShowCreateModal(true)}
          >
            <Icon name="plus" size={16} />
            {t('polls.createPoll')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card bg-base-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('polls.filterStatus')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as PollStatus | '')}
            >
              <option value="">{t('common.all')}</option>
              <option value="draft">{t('polls.status.draft')}</option>
              <option value="active">{t('polls.status.active')}</option>
              <option value="closed">{t('polls.status.closed')}</option>
              <option value="archived">{t('polls.status.archived')}</option>
            </select>
          </div>

          <div className="form-control flex-1 min-w-[200px]">
            <label className="label">
              <span className="label-text">{t('common.search')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder={t('polls.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Polls list */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={5} />
      ) : filteredPolls.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="clipboard" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('polls.noPolls')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPolls.map((poll) => (
            <div
              key={poll.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedPoll(poll)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="card-title text-lg line-clamp-2">{poll.title}</h3>
                  {getStatusBadge(poll.status)}
                </div>

                {poll.description && (
                  <p className="text-sm text-base-content/70 line-clamp-2">{poll.description}</p>
                )}

                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="badge badge-outline badge-sm">
                    {getPollTypeLabel(poll.pollType)}
                  </span>
                  {poll.isAnonymous && (
                    <span className="badge badge-ghost badge-sm gap-1">
                      <Icon name="eyeOff" size={12} />
                      {t('polls.anonymous')}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center mt-4 text-sm text-base-content/60">
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={14} />
                    {poll.voteCount} {t('polls.votes')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="clipboard" size={14} />
                    {poll.optionCount} {t('polls.options')}
                  </span>
                </div>

                {poll.hasVoted && (
                  <div className="mt-2">
                    <span className="badge badge-success badge-sm gap-1">
                      <Icon name="checkCircle" size={12} />
                      {t('polls.youVoted')}
                    </span>
                  </div>
                )}

                {poll.endsAt && (
                  <div className="mt-2 text-xs text-base-content/50">
                    {new Date(poll.endsAt) > new Date()
                      ? t('polls.endsAt', { date: formatDateTime(poll.endsAt) })
                      : t('polls.endedAt', { date: formatDateTime(poll.endsAt) })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Poll Detail Modal */}
      {selectedPoll && pollDetail && (
        <PollDetailModal
          poll={pollDetail}
          canEdit={canCreate}
          onClose={() => setSelectedPoll(null)}
          onDelete={() => {
            if (confirm(t('polls.confirmDelete'))) {
              deleteMutation.mutate(selectedPoll.id);
            }
          }}
          onStatusChange={(status) => {
            statusMutation.mutate({ id: selectedPoll.id, status });
          }}
          onVote={() => setShowVoteModal(true)}
        />
      )}

      {/* Vote Modal */}
      {showVoteModal && pollDetail && (
        <VoteModal
          poll={pollDetail}
          onClose={() => setShowVoteModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['poll', selectedPoll?.id] });
            queryClient.invalidateQueries({ queryKey: ['polls'] });
            setShowVoteModal(false);
          }}
        />
      )}

      {/* Create Poll Modal */}
      {showCreateModal && (
        <CreatePollModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['polls'] });
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// Poll Detail Modal Component
function PollDetailModal({
  poll,
  canEdit,
  onClose,
  onDelete,
  onStatusChange,
  onVote,
}: {
  poll: PollDetail;
  canEdit: boolean;
  onClose: () => void;
  onDelete: () => void;
  onStatusChange: (status: PollStatus) => void;
  onVote: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.voteCount || 0), 0);

  const commentMutation = useMutation({
    mutationFn: (content: string) => addPollComment(poll.id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poll', poll.id] });
      setNewComment('');
      showSuccess(t('polls.commentAdded'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorComment'));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deletePollComment(poll.id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poll', poll.id] });
      showSuccess(t('polls.commentDeleted'));
    },
  });

  const retractMutation = useMutation({
    mutationFn: () => retractVote(poll.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poll', poll.id] });
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      showSuccess(t('polls.voteRetracted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorRetract'));
    },
  });

  const reminderMutation = useMutation({
    mutationFn: () => sendPollReminder(poll.id),
    onSuccess: (data) => {
      showSuccess(t('polls.reminderSent', { count: data.sent }));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorReminder'));
    },
  });

  const createRehearsalMutation = useMutation({
    mutationFn: () => createRehearsalFromPoll(poll.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
      showSuccess(t('polls.rehearsalCreated', { date: new Date(data.date).toLocaleDateString() }));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorCreateRehearsal'));
    },
  });

  const canVote = poll.status === 'active' && !poll.hasVoted;
  const canRetract = poll.status === 'active' && poll.hasVoted;

  return (
    <Modal onClose={onClose} size="large" title={poll.title}>
      <div className="space-y-6">
        {/* Header info */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`badge ${STATUS_COLORS[poll.status]}`}>
            <Icon name={STATUS_ICONS[poll.status]} size={12} className="mr-1" />
            {t(`polls.status.${poll.status}`)}
          </span>
          <span className="badge badge-outline">{t(POLL_TYPE_LABELS[poll.pollType])}</span>
          {poll.isAnonymous && (
            <span className="badge badge-ghost">
              <Icon name="eyeOff" size={12} className="mr-1" />
              {t('polls.anonymous')}
            </span>
          )}
        </div>

        {poll.description && (
          <p className="text-base-content/80">{poll.description}</p>
        )}

        {/* Poll options with results */}
        <div className="space-y-3">
          <h4 className="font-semibold">{t('polls.optionsTitle')}</h4>
          {poll.options.map((option) => {
            const percentage = totalVotes > 0 ? Math.round((option.voteCount || 0) / totalVotes * 100) : 0;
            const isUserVote = poll.userVotes.some(v => v.optionId === option.id);

            return (
              <div key={option.id} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className={`flex-1 ${isUserVote ? 'font-semibold' : ''}`}>
                    {option.text}
                    {isUserVote && (
                      <Icon name="checkCircle" size={14} className="inline ml-2 text-success" />
                    )}
                  </span>
                  {poll.canSeeResults && (
                    <span className="text-sm text-base-content/60">
                      {option.voteCount || 0} ({percentage}%)
                    </span>
                  )}
                </div>
                {poll.canSeeResults && (
                  <div className="w-full bg-base-300 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isUserVote ? 'bg-success' : 'bg-primary'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                )}
                {option.description && (
                  <p className="text-sm text-base-content/60">{option.description}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Vote/Retract buttons */}
        <div className="flex gap-2">
          {canVote && (
            <button className="btn btn-primary" onClick={onVote}>
              <Icon name="checkCircle" size={16} className="mr-1" />
              {t('polls.vote')}
            </button>
          )}
          {canRetract && (
            <button
              className="btn btn-outline btn-warning"
              onClick={() => retractMutation.mutate()}
              disabled={retractMutation.isPending}
            >
              <Icon name="close" size={16} className="mr-1" />
              {t('polls.retractVote')}
            </button>
          )}
        </div>

        {/* Total voters */}
        <div className="text-sm text-base-content/60">
          {t('polls.totalVoters', { count: poll.totalVoters })}
        </div>

        {/* Comments section */}
        {poll.allowComments && (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-semibold">{t('polls.comments')}</h4>

            {poll.comments.length === 0 ? (
              <p className="text-sm text-base-content/60">{t('polls.noComments')}</p>
            ) : (
              <div className="space-y-3">
                {poll.comments.map((comment) => (
                  <div key={comment.id} className="bg-base-200 p-3 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{comment.authorName}</span>
                        <span className="text-xs text-base-content/50 ml-2">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      {(comment.authorId === user?.id || canEdit) && (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            if (confirm(t('polls.confirmDeleteComment'))) {
                              deleteCommentMutation.mutate(comment.id);
                            }
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            <div className="flex gap-2">
              <input
                type="text"
                className="input input-bordered flex-1"
                placeholder={t('polls.addCommentPlaceholder')}
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
                disabled={!newComment.trim() || commentMutation.isPending}
              >
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Admin actions */}
        {canEdit && (
          <div className="border-t pt-4 flex flex-wrap gap-2">
            {poll.status === 'draft' && (
              <button
                className="btn btn-success btn-sm"
                onClick={() => onStatusChange('active')}
              >
                <Icon name="play" size={14} className="mr-1" />
                {t('polls.activate')}
              </button>
            )}
            {poll.status === 'active' && (
              <>
                <button
                  className="btn btn-warning btn-sm"
                  onClick={() => onStatusChange('closed')}
                >
                  <Icon name="lock" size={14} className="mr-1" />
                  {t('polls.close')}
                </button>
                <button
                  className="btn btn-info btn-sm"
                  onClick={() => reminderMutation.mutate()}
                  disabled={reminderMutation.isPending}
                >
                  {reminderMutation.isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Icon name="bell" size={14} className="mr-1" />
                  )}
                  {t('polls.sendReminder')}
                </button>
              </>
            )}
            {poll.status === 'closed' && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onStatusChange('archived')}
                >
                  <Icon name="archive" size={14} className="mr-1" />
                  {t('polls.archive')}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (confirm(t('polls.confirmCreateRehearsal'))) {
                      createRehearsalMutation.mutate();
                    }
                  }}
                  disabled={createRehearsalMutation.isPending}
                >
                  {createRehearsalMutation.isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Icon name="calendar" size={14} className="mr-1" />
                  )}
                  {t('polls.createRehearsal')}
                </button>
              </>
            )}
            {poll.status === 'draft' && (
              <button className="btn btn-error btn-sm" onClick={onDelete}>
                <Icon name="trash" size={14} className="mr-1" />
                {t('common.delete')}
              </button>
            )}
          </div>
        )}

        {/* Meta info */}
        <div className="text-xs text-base-content/50 border-t pt-2">
          {t('polls.createdBy', { name: poll.createdByName, date: formatDateTime(poll.createdAt) })}
        </div>
      </div>
    </Modal>
  );
}

// Vote Modal Component
function VoteModal({
  poll,
  onClose,
  onSuccess,
}: {
  poll: PollDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const voteMutation = useMutation({
    mutationFn: () => submitVote(poll.id, { optionIds: selectedOptions }),
    onSuccess: () => {
      showSuccess(t('polls.voteSubmitted'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorVote'));
    },
  });

  const handleOptionToggle = (optionId: string) => {
    if (poll.pollType === 'single') {
      setSelectedOptions([optionId]);
    } else {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : poll.maxSelections && prev.length >= poll.maxSelections
          ? prev
          : [...prev, optionId]
      );
    }
  };

  const canSubmit = selectedOptions.length > 0;

  return (
    <Modal onClose={onClose} size="medium" title={t('polls.castVote')}>
      <div className="space-y-4">
        <p className="text-sm text-base-content/70">
          {poll.pollType === 'single'
            ? t('polls.selectOneOption')
            : poll.maxSelections
            ? t('polls.selectUpToOptions', { count: poll.maxSelections })
            : t('polls.selectMultipleOptions')}
        </p>

        <div className="space-y-2">
          {poll.options.map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOptions.includes(option.id)
                  ? 'border-primary bg-primary/10'
                  : 'border-base-300 hover:border-primary/50'
              }`}
            >
              <input
                type={poll.pollType === 'single' ? 'radio' : 'checkbox'}
                name="poll-option"
                checked={selectedOptions.includes(option.id)}
                onChange={() => handleOptionToggle(option.id)}
                className={poll.pollType === 'single' ? 'radio radio-primary' : 'checkbox checkbox-primary'}
              />
              <div>
                <span className="font-medium">{option.text}</span>
                {option.description && (
                  <p className="text-sm text-base-content/60 mt-1">{option.description}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => voteMutation.mutate()}
            disabled={!canSubmit || voteMutation.isPending}
          >
            {voteMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <Icon name="checkCircle" size={16} className="mr-1" />
                {t('polls.submitVote')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Create Poll Modal Component
function CreatePollModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreatePollData>({
    title: '',
    description: '',
    pollType: 'single',
    isAnonymous: false,
    showResultsBeforeClose: false,
    allowComments: true,
    options: [{ text: '' }, { text: '' }],
  });

  const createMutation = useMutation({
    mutationFn: createPoll,
    onSuccess: () => {
      showSuccess(t('polls.created'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('polls.errorCreate'));
    },
  });

  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { text: '' }],
    }));
  };

  const removeOption = (index: number) => {
    if (formData.options.length > 2) {
      setFormData((prev) => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== index),
      }));
    }
  };

  const updateOption = (index: number, text: string) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? { ...opt, text } : opt)),
    }));
  };

  const canSubmit =
    formData.title.trim() &&
    formData.options.filter((o) => o.text.trim()).length >= 2;

  const handleSubmit = () => {
    const data: CreatePollData = {
      ...formData,
      options: formData.options.filter((o) => o.text.trim()),
    };
    createMutation.mutate(data);
  };

  return (
    <Modal onClose={onClose} size="large" title={t('polls.createPoll')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('polls.pollTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={t('polls.titlePlaceholder')}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('polls.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={t('polls.descriptionPlaceholder')}
            rows={3}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('polls.pollType')}</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.pollType}
            onChange={(e) => setFormData((prev) => ({ ...prev, pollType: e.target.value as PollType }))}
          >
            <option value="single">{t('polls.typeSingle')}</option>
            <option value="multiple">{t('polls.typeMultiple')}</option>
            <option value="ranked">{t('polls.typeRanked')}</option>
          </select>
        </div>

        {formData.pollType === 'multiple' && (
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('polls.maxSelections')}</span>
            </label>
            <input
              type="number"
              className="input input-bordered w-24"
              min={1}
              value={formData.maxSelections || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  maxSelections: e.target.value ? parseInt(e.target.value) : undefined,
                }))
              }
              placeholder={t('polls.unlimited')}
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="label">
            <span className="label-text">{t('polls.optionsLabel')} *</span>
          </label>
          {formData.options.map((option, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                className="input input-bordered flex-1"
                value={option.text}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`${t('polls.option')} ${index + 1}`}
              />
              {formData.options.length > 2 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-square"
                  onClick={() => removeOption(index)}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={addOption}>
            <Icon name="plus" size={14} />
            {t('polls.addOption')}
          </button>
        </div>

        <div className="divider">{t('polls.settings')}</div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.isAnonymous}
              onChange={(e) => setFormData((prev) => ({ ...prev, isAnonymous: e.target.checked }))}
            />
            <span className="text-sm">{t('polls.anonymousVoting')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.showResultsBeforeClose}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, showResultsBeforeClose: e.target.checked }))
              }
            />
            <span className="text-sm">{t('polls.showResultsBeforeClose')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.allowComments}
              onChange={(e) => setFormData((prev) => ({ ...prev, allowComments: e.target.checked }))}
            />
            <span className="text-sm">{t('polls.allowComments')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <Icon name="plus" size={16} className="mr-1" />
                {t('polls.createPoll')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
