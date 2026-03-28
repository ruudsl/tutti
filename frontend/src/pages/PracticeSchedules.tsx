import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { nl, enUS } from 'date-fns/locale';
import {
  usePracticeSchedules,
  usePracticeSchedule,
  useCreatePracticeSchedule,
  useDeletePracticeSchedule,
  useAddMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useUpdateSectionProgress,
  useInitializeSections,
} from '../hooks/usePracticeSchedules';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicTitles } from '../hooks/useMusicTitles';
import { useAuth } from '../context/AuthContext';
import { FormModal, Modal } from '../components/Modal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function PracticeSchedules() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language === 'nl' ? nl : enUS;
  useDocumentTitle(t('practiceSchedules.title'));

  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: orchestras } = useOrchestras();
  const { data: schedules, isLoading } = usePracticeSchedules({
    orchestraId: selectedOrchestraId || undefined,
    upcoming: true,
  });

  const canManage = user?.role && ['admin', 'conductor', 'music_committee'].includes(user.role);

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return <span className="badge badge-error">{t('practiceSchedules.priorityHigh')}</span>;
      case 2:
        return <span className="badge badge-warning">{t('practiceSchedules.priorityNormal')}</span>;
      default:
        return <span className="badge badge-ghost">{t('practiceSchedules.priorityLow')}</span>;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('practiceSchedules.title')}</h1>
        <div className="flex gap-2">
          <select
            className="select select-bordered"
            value={selectedOrchestraId}
            onChange={(e) => setSelectedOrchestraId(e.target.value)}
          >
            <option value="">{t('common.allOrchestras')}</option>
            {orchestras?.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {canManage && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              {t('practiceSchedules.create')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : schedules?.length === 0 ? (
        <div className="text-center p-8 text-base-content/60">
          {t('practiceSchedules.empty')}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules?.map((schedule) => (
            <div
              key={schedule.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedScheduleId(schedule.id)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h2 className="card-title text-lg">{schedule.musicTitle.title}</h2>
                  {getPriorityBadge(schedule.priority)}
                </div>
                {schedule.musicTitle.composer && (
                  <p className="text-sm text-base-content/70">{schedule.musicTitle.composer}</p>
                )}
                <div className="text-sm text-base-content/60">
                  {schedule.orchestra.name}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">
                    {t('practiceSchedules.targetDate')}: {format(new Date(schedule.targetDate), 'PPP', { locale })}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t('practiceSchedules.progress')}</span>
                    <span>{schedule.progress}%</span>
                  </div>
                  <progress
                    className="progress progress-primary w-full"
                    value={schedule.progress}
                    max={100}
                  />
                  <div className="text-xs text-base-content/60 mt-1">
                    {schedule.completedMilestones}/{schedule.milestoneCount} {t('practiceSchedules.milestones')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateScheduleModal onClose={() => setShowCreateModal(false)} />
      )}

      {selectedScheduleId && (
        <ScheduleDetailModal
          scheduleId={selectedScheduleId}
          onClose={() => setSelectedScheduleId(null)}
        />
      )}
    </div>
  );
}

function CreateScheduleModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [musicTitleId, setMusicTitleId] = useState('');
  const [orchestraId, setOrchestraId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priority, setPriority] = useState(2);
  const [notes, setNotes] = useState('');

  const { data: orchestras } = useOrchestras();
  const { data: musicTitles } = useMusicTitles();
  const createSchedule = useCreatePracticeSchedule();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSchedule.mutateAsync({
      musicTitleId,
      orchestraId,
      targetDate,
      priority,
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <FormModal
      title={t('practiceSchedules.create')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('common.create')}
      isSubmitting={createSchedule.isPending}
    >
      <div className="space-y-4">
        <div className="form-group">
          <label className="form-label">{t('music.title')} *</label>
          <select
            className="form-control"
            value={musicTitleId}
            onChange={(e) => setMusicTitleId(e.target.value)}
            required
          >
            <option value="">{t('common.select')}</option>
            {musicTitles?.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.title}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.orchestra')} *</label>
          <select
            className="form-control"
            value={orchestraId}
            onChange={(e) => setOrchestraId(e.target.value)}
            required
          >
            <option value="">{t('common.select')}</option>
            {orchestras?.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t('practiceSchedules.targetDate')} *</label>
          <input
            type="date"
            className="form-control"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('practiceSchedules.priority')}</label>
          <select
            className="form-control"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value))}
          >
            <option value={1}>{t('practiceSchedules.priorityLow')}</option>
            <option value={2}>{t('practiceSchedules.priorityNormal')}</option>
            <option value={3}>{t('practiceSchedules.priorityHigh')}</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.notes')}</label>
          <textarea
            className="form-control"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </FormModal>
  );
}

function ScheduleDetailModal({ scheduleId, onClose }: { scheduleId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language === 'nl' ? nl : enUS;
  const [showAddMilestone, setShowAddMilestone] = useState(false);

  const { data: schedule, isLoading } = usePracticeSchedule(scheduleId);
  const deleteSchedule = useDeletePracticeSchedule();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const updateProgress = useUpdateSectionProgress();
  const initializeSections = useInitializeSections();

  const canManage = user?.role && ['admin', 'conductor', 'music_committee'].includes(user.role);

  const handleDelete = async () => {
    if (confirm(t('practiceSchedules.confirmDelete'))) {
      await deleteSchedule.mutateAsync(scheduleId);
      onClose();
    }
  };

  const handleToggleMilestone = async (milestoneId: string, isCompleted: boolean) => {
    await updateMilestone.mutateAsync({ milestoneId, isCompleted: !isCompleted });
  };

  const handleSectionProgress = async (
    milestoneId: string,
    instrumentId: string,
    status: 'pending' | 'in_progress' | 'completed'
  ) => {
    await updateProgress.mutateAsync({ milestoneId, instrumentId, status });
  };

  if (isLoading) {
    return (
      <Modal title="" onClose={onClose}>
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </Modal>
    );
  }

  if (!schedule) return null;

  return (
    <Modal
      title={schedule.musicTitle.title}
      onClose={onClose}
      className="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Header Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-base-content/60">{t('common.orchestra')}:</span>{' '}
            {schedule.orchestra.name}
          </div>
          <div>
            <span className="text-base-content/60">{t('practiceSchedules.targetDate')}:</span>{' '}
            {format(new Date(schedule.targetDate), 'PPP', { locale })}
          </div>
          {schedule.musicTitle.composer && (
            <div>
              <span className="text-base-content/60">{t('music.composer')}:</span>{' '}
              {schedule.musicTitle.composer}
            </div>
          )}
          {schedule.notes && (
            <div className="col-span-2">
              <span className="text-base-content/60">{t('common.notes')}:</span>{' '}
              {schedule.notes}
            </div>
          )}
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="font-semibold">{t('practiceSchedules.overallProgress')}</span>
            <span>{Math.round((schedule.milestones.filter(m => m.isCompleted).length / schedule.milestones.length) * 100) || 0}%</span>
          </div>
          <progress
            className="progress progress-primary w-full h-3"
            value={schedule.milestones.filter(m => m.isCompleted).length}
            max={schedule.milestones.length || 1}
          />
        </div>

        {/* Milestones */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">{t('practiceSchedules.milestones')}</h3>
            <div className="flex gap-2">
              {canManage && (
                <>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => initializeSections.mutate(scheduleId)}
                    disabled={initializeSections.isPending}
                  >
                    {t('practiceSchedules.initializeSections')}
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowAddMilestone(true)}>
                    {t('practiceSchedules.addMilestone')}
                  </button>
                </>
              )}
            </div>
          </div>

          {schedule.milestones.length === 0 ? (
            <p className="text-base-content/60 text-center py-4">{t('practiceSchedules.noMilestones')}</p>
          ) : (
            <div className="space-y-4">
              {schedule.milestones.map((milestone) => (
                <div key={milestone.id} className="card bg-base-200 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary"
                        checked={milestone.isCompleted}
                        onChange={() => handleToggleMilestone(milestone.id, milestone.isCompleted)}
                        disabled={!canManage}
                      />
                      <div>
                        <div className={`font-medium ${milestone.isCompleted ? 'line-through opacity-60' : ''}`}>
                          {milestone.title}
                        </div>
                        {milestone.description && (
                          <div className="text-sm text-base-content/60">{milestone.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-base-content/60">
                        {format(new Date(milestone.targetDate), 'PP', { locale })}
                      </span>
                      {canManage && (
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => deleteMilestone.mutate(milestone.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section Progress */}
                  {milestone.sectionProgress.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3 pt-3 border-t border-base-300">
                      {milestone.sectionProgress.map((sp) => (
                        <div
                          key={sp.id}
                          className="flex items-center justify-between bg-base-100 rounded px-2 py-1"
                        >
                          <span className="text-sm truncate">
                            {sp.instrument.name}
                            {sp.instrument.tuning && ` (${sp.instrument.tuning})`}
                          </span>
                          <select
                            className={`select select-xs ${
                              sp.status === 'completed' ? 'select-success' :
                              sp.status === 'in_progress' ? 'select-warning' : ''
                            }`}
                            value={sp.status}
                            onChange={(e) =>
                              handleSectionProgress(
                                milestone.id,
                                sp.instrument.id,
                                e.target.value as 'pending' | 'in_progress' | 'completed'
                              )
                            }
                          >
                            <option value="pending">-</option>
                            <option value="in_progress">⏳</option>
                            <option value="completed">✓</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button className="btn btn-error btn-outline" onClick={handleDelete}>
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>

      {showAddMilestone && (
        <AddMilestoneModal
          scheduleId={scheduleId}
          onClose={() => setShowAddMilestone(false)}
        />
      )}
    </Modal>
  );
}

function AddMilestoneModal({ scheduleId, onClose }: { scheduleId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const addMilestone = useAddMilestone();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addMilestone.mutateAsync({
      scheduleId,
      title,
      description: description || undefined,
      targetDate,
    });
    onClose();
  };

  return (
    <FormModal
      title={t('practiceSchedules.addMilestone')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('common.add')}
      isSubmitting={addMilestone.isPending}
    >
      <div className="space-y-4">
        <div className="form-group">
          <label className="form-label">{t('common.title')} *</label>
          <input
            type="text"
            className="form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('practiceSchedules.milestonePlaceholder')}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.description')}</label>
          <textarea
            className="form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('practiceSchedules.targetDate')} *</label>
          <input
            type="date"
            className="form-control"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            required
          />
        </div>
      </div>
    </FormModal>
  );
}
