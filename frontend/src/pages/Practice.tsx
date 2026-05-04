import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getPracticeLogs,
  getPracticeStats,
  getPracticeGoals,
  logPractice,
  deletePracticeLog,
  setPracticeGoal,
  deletePracticeGoal,
  getMusicTitles,
} from '../api';
import type { PracticeGoalsResponse } from '../api/practice';
import { SkeletonTable } from '../components/Skeleton';
import PracticeTimer from '../components/PracticeTimer';

export default function Practice() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.practice');
  const queryClient = useQueryClient();

  // Log practice form
  const [showLogForm, setShowLogForm] = useState(false);
  const [selectedTitleId, setSelectedTitleId] = useState('');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [logging, setLogging] = useState(false);

  // Goal form
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalType, setGoalType] = useState<'daily' | 'weekly'>('daily');
  const [goalMinutes, setGoalMinutes] = useState(30);
  const [savingGoal, setSavingGoal] = useState(false);

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['practiceStats'],
    queryFn: getPracticeStats,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goalsData, isLoading: goalsLoading } = useQuery<PracticeGoalsResponse>({
    queryKey: ['practiceGoals'],
    queryFn: getPracticeGoals,
    staleTime: 5 * 60 * 1000,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['practiceLogs'],
    queryFn: () => getPracticeLogs(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: titles = [] } = useQuery({
    queryKey: ['musicTitles', titleSearch],
    queryFn: () => getMusicTitles({ search: titleSearch }),
    enabled: showLogForm,
    staleTime: 5 * 60 * 1000,
  });

  // Calculated values
  const dailyGoal = goalsData?.goals.find(g => g.goalType === 'daily');
  const weeklyGoal = goalsData?.goals.find(g => g.goalType === 'weekly');
  const dailyProgress = goalsData?.progress.daily || 0;
  const weeklyProgress = goalsData?.progress.weekly || 0;

  const dailyPercentage = dailyGoal ? Math.min(100, Math.round((dailyProgress / dailyGoal.targetMinutes) * 100)) : 0;
  const weeklyPercentage = weeklyGoal ? Math.min(100, Math.round((weeklyProgress / weeklyGoal.targetMinutes) * 100)) : 0;

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}u ${mins}m` : `${hours}u`;
  };

  const handleLogPractice = async () => {
    if (!selectedTitleId || duration < 1) return;
    setLogging(true);
    try {
      await logPractice(selectedTitleId, duration, notes || undefined);
      showSuccess(t('practice.logged'));
      setShowLogForm(false);
      setSelectedTitleId('');
      setDuration(30);
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: ['practiceStats'] });
      queryClient.invalidateQueries({ queryKey: ['practiceGoals'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    } finally {
      setLogging(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm(t('practice.deleteConfirm'))) return;
    try {
      await deletePracticeLog(id);
      showSuccess(t('practice.deleted'));
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: ['practiceStats'] });
      queryClient.invalidateQueries({ queryKey: ['practiceGoals'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleSetGoal = async () => {
    if (goalMinutes < 1 || goalMinutes > 1440) return;
    setSavingGoal(true);
    try {
      await setPracticeGoal(goalType, goalMinutes);
      showSuccess(t('practice.goalSaved'));
      setShowGoalForm(false);
      queryClient.invalidateQueries({ queryKey: ['practiceGoals'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm(t('practice.deleteGoalConfirm'))) return;
    try {
      await deletePracticeGoal(id);
      showSuccess(t('practice.goalDeleted'));
      queryClient.invalidateQueries({ queryKey: ['practiceGoals'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  if (statsLoading || goalsLoading) {
    return (
      <div>
        <h1>{t('practice.title')}</h1>
        <SkeletonTable rows={4} columns={3} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>{t('practice.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowLogForm(true)}>
          + {t('practice.logSession')}
        </button>
      </div>

      {/* Practice Timer */}
      <div style={{ marginBottom: '1.5rem' }}>
        <PracticeTimer
          onSessionEnd={(durationMinutes) => {
            // When timer session ends, trigger refresh of practice data
            queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
            queryClient.invalidateQueries({ queryKey: ['practiceStats'] });
            queryClient.invalidateQueries({ queryKey: ['practiceGoals'] });
            showSuccess(t('practice.timerSessionEnded', `Oefensessie van ${durationMinutes} minuten beeindigd!`));
          }}
        />
      </div>

      {/* Stats overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {stats?.currentStreak || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {t('practice.streak')}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>
              {formatDuration(stats?.weekMinutes || 0)}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {t('practice.thisWeek')}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {formatDuration(stats?.monthMinutes || 0)}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {t('practice.thisMonth')}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {formatDuration(stats?.totalMinutes || 0)}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {t('practice.allTime')}
            </div>
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('practice.goals')}</h2>
          <button className="btn btn-outline btn-sm" onClick={() => setShowGoalForm(!showGoalForm)}>
            {showGoalForm ? t('common.cancel') : t('practice.setGoal')}
          </button>
        </div>
        <div className="card-body">
          {showGoalForm && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', background: 'var(--background)', borderRadius: 'var(--radius-sm)' }}>
              <div className="form-group">
                <label className="form-label">{t('practice.goalType')}</label>
                <select
                  className="form-control form-select"
                  value={goalType}
                  onChange={e => setGoalType(e.target.value as 'daily' | 'weekly')}
                >
                  <option value="daily">{t('practice.daily')}</option>
                  <option value="weekly">{t('practice.weekly')}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('practice.targetMinutes')}</label>
                <input
                  type="number"
                  className="form-control"
                  value={goalMinutes}
                  onChange={e => setGoalMinutes(Math.max(1, Math.min(1440, parseInt(e.target.value) || 30)))}
                  min={1}
                  max={1440}
                  style={{ width: '100px' }}
                />
              </div>
              <button className="btn btn-primary" onClick={handleSetGoal} disabled={savingGoal}>
                {savingGoal ? t('common.loading') : t('common.save')}
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Daily goal */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong>{t('practice.dailyGoal')}</strong>
                {dailyGoal && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDeleteGoal(dailyGoal.id)}
                    style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }}
                  >
                    &times;
                  </button>
                )}
              </div>
              {dailyGoal ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                    <span>{formatDuration(dailyProgress)} / {formatDuration(dailyGoal.targetMinutes)}</span>
                    <span>{dailyPercentage}%</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${dailyPercentage}%`,
                        height: '100%',
                        background: dailyPercentage >= 100 ? 'var(--success)' : 'var(--primary)',
                        borderRadius: '5px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  {dailyPercentage >= 100 && (
                    <div style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {t('practice.goalReached')}
                    </div>
                  )}
                </div>
              ) : (
                <p className="piece-meta">{t('practice.noGoalSet')}</p>
              )}
            </div>

            {/* Weekly goal */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong>{t('practice.weeklyGoal')}</strong>
                {weeklyGoal && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDeleteGoal(weeklyGoal.id)}
                    style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }}
                  >
                    &times;
                  </button>
                )}
              </div>
              {weeklyGoal ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                    <span>{formatDuration(weeklyProgress)} / {formatDuration(weeklyGoal.targetMinutes)}</span>
                    <span>{weeklyPercentage}%</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${weeklyPercentage}%`,
                        height: '100%',
                        background: weeklyPercentage >= 100 ? 'var(--success)' : 'var(--primary)',
                        borderRadius: '5px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  {weeklyPercentage >= 100 && (
                    <div style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {t('practice.goalReached')}
                    </div>
                  )}
                </div>
              ) : (
                <p className="piece-meta">{t('practice.noGoalSet')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Most practiced */}
      {stats && stats.mostPracticed.length > 0 && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('practice.mostPracticed')}</h2>
          </div>
          <div className="card-body flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('practice.piece')}</th>
                  <th style={{ textAlign: 'right' }}>{t('practice.totalTime')}</th>
                  <th style={{ textAlign: 'right' }}>{t('practice.sessions')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.mostPracticed.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <strong>{piece.title}</strong>
                      {piece.arranger && <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}> - {piece.arranger}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatDuration(piece.totalMinutes)}</td>
                    <td style={{ textAlign: 'right' }}>{piece.sessionCount}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent logs */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('practice.recentSessions')}</h2>
        </div>
        <div className="card-body flush">
          {logsLoading ? (
            <SkeletonTable rows={5} columns={4} />
          ) : logs.length === 0 ? (
            <p className="piece-meta" style={{ padding: '1rem' }}>{t('practice.noSessions')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('practice.date')}</th>
                  <th>{t('practice.piece')}</th>
                  <th style={{ textAlign: 'right' }}>{t('practice.duration')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.practicedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <strong>{log.musicTitle.title}</strong>
                      {log.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{log.notes}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{log.durationMinutes} min</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDeleteLog(log.id)}
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--danger)' }}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Log practice modal */}
      {showLogForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowLogForm(false)}>
          <div className="card" style={{ width: '90%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <h2 className="card-title">{t('practice.logSession')}</h2>
            </div>
            <div className="card-body">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">{t('practice.selectPiece')}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('practice.searchPiece')}
                  value={titleSearch}
                  onChange={e => setTitleSearch(e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                />
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  {titles.length === 0 ? (
                    <div style={{ padding: '0.75rem', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                      {titleSearch ? t('practice.noResults') : t('practice.typeToSearch')}
                    </div>
                  ) : (
                    titles.slice(0, 20).filter(title => title.id).map(title => (
                      <div
                        key={title.id}
                        onClick={() => setSelectedTitleId(title.id!)}
                        style={{
                          padding: '0.75rem',
                          cursor: 'pointer',
                          background: selectedTitleId === title.id ? 'var(--primary-light, rgba(var(--primary-rgb), 0.1))' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <strong>{title.title}</strong>
                        {title.arranger && <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}> - {title.arranger}</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">{t('practice.duration')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    min={5}
                    max={180}
                    step={5}
                    value={duration}
                    onChange={e => setDuration(parseInt(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    className="form-control"
                    value={duration}
                    onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 30))}
                    min={1}
                    style={{ width: '80px' }}
                  />
                  <span style={{ color: 'var(--text-light)' }}>min</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">{t('practice.notes')}</label>
                <textarea
                  className="form-control"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t('practice.notesPlaceholder')}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowLogForm(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleLogPractice}
                  disabled={!selectedTitleId || logging}
                >
                  {logging ? t('common.loading') : t('practice.log')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
