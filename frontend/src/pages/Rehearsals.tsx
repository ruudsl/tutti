import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getRehearsals, createRehearsal, updateRehearsal, deleteRehearsal,
  getRehearsal, updateRehearsalPieces,
  getDefaultDays, addDefaultDay, deleteDefaultDay,
  generateRehearsals,
} from '../api';
import type { Rehearsal, RehearsalDetail, RehearsalDefaultDay } from '../types';

const MANAGER_ROLES = ['admin', 'music_committee', 'conductor'];

export default function Rehearsals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.rehearsals');

  const isManager = user && MANAGER_ROLES.includes(user.role);

  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([]);
  const [defaultDays, setDefaultDays] = useState<RehearsalDefaultDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRehearsal, setSelectedRehearsal] = useState<RehearsalDetail | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: '', startTime: '19:30', endTime: '21:30', location: '', type: 'regular', notes: '' });

  // Default day form
  const [showDefaultForm, setShowDefaultForm] = useState(false);
  const [defaultForm, setDefaultForm] = useState({ dayOfWeek: 1, startTime: '19:30', endTime: '21:30', location: '' });

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false);
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');

  // Pieces editing
  const [editingPieces, setEditingPieces] = useState(false);
  const [pieces, setPieces] = useState<{ title: string; notes: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const sixMonths = new Date();
      sixMonths.setMonth(sixMonths.getMonth() + 6);
      const [reh, days] = await Promise.all([
        getRehearsals(today, sixMonths.toISOString().split('T')[0]),
        isManager ? getDefaultDays() : Promise.resolve([]),
      ]);
      setRehearsals(reh);
      setDefaultDays(days);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return rehearsals.filter(r => r.date >= today);
  }, [rehearsals]);

  const handleOpenDetail = async (id: string) => {
    try {
      const detail = await getRehearsal(id);
      setSelectedRehearsal(detail);
      setEditingPieces(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRehearsal = async () => {
    try {
      if (editingId) {
        await updateRehearsal(editingId, form);
        showSuccess(t('rehearsals.saved'));
      } else {
        await createRehearsal(form);
        showSuccess(t('rehearsals.created'));
      }
      setShowForm(false);
      setEditingId(null);
      loadData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('rehearsals.deleteConfirm'))) return;
    try {
      await deleteRehearsal(id);
      showSuccess(t('rehearsals.deleted'));
      if (selectedRehearsal?.id === id) setSelectedRehearsal(null);
      loadData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const handleEdit = (r: Rehearsal) => {
    setForm({ date: r.date, startTime: r.start_time, endTime: r.end_time, location: r.location || '', type: r.type, notes: r.notes || '' });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleAddDefaultDay = async () => {
    try {
      await addDefaultDay(defaultForm);
      setShowDefaultForm(false);
      loadData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const handleDeleteDefaultDay = async (id: string) => {
    try {
      await deleteDefaultDay(id);
      loadData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateRehearsals(genFrom, genTo);
      showSuccess(t('rehearsals.generated', { count: result.count }));
      setShowGenerate(false);
      loadData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const handleStartEditPieces = () => {
    if (selectedRehearsal) {
      setPieces(selectedRehearsal.pieces.map(p => ({ title: p.title, notes: p.notes || '' })));
      setEditingPieces(true);
    }
  };

  const handleSavePieces = async () => {
    if (!selectedRehearsal) return;
    try {
      await updateRehearsalPieces(selectedRehearsal.id, pieces.filter(p => p.title.trim()));
      showSuccess(t('rehearsals.piecesSaved'));
      handleOpenDetail(selectedRehearsal.id);
    } catch (e: any) {
      showError(e.response?.data?.error || t('rehearsals.errorSaving'));
    }
  };

  const getTypeStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'extra': return { borderLeft: '4px solid var(--warning)' };
      case 'cancelled': return { borderLeft: '4px solid var(--danger)', opacity: 0.6, textDecoration: 'line-through' };
      default: return { borderLeft: '4px solid var(--primary)' };
    }
  };

  if (isLoading) {
    return (
      <div className="loading" role="status">
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  // Detail view
  if (selectedRehearsal) {
    return (
      <div>
        <button className="btn btn-outline mb-3" onClick={() => setSelectedRehearsal(null)}>
          &larr; {t('common.back')}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
          <div>
            <h1>{formatDate(selectedRehearsal.date, t)}</h1>
            <p className="piece-meta">
              {selectedRehearsal.start_time} - {selectedRehearsal.end_time}
              {selectedRehearsal.location && ` · ${selectedRehearsal.location}`}
              {' · '}
              <span className={`badge badge-${selectedRehearsal.type === 'extra' ? 'warning' : selectedRehearsal.type === 'cancelled' ? 'danger' : 'primary'}`}>
                {t(`rehearsals.types.${selectedRehearsal.type}`)}
              </span>
            </p>
          </div>
        </div>

        {selectedRehearsal.notes && (
          <div className="card mb-3">
            <div className="card-body">
              <strong>{t('rehearsals.notes')}:</strong> {selectedRehearsal.notes}
            </div>
          </div>
        )}

        {/* Pieces / Repertoire */}
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.pieces')}</h2>
            {isManager && !editingPieces && (
              <button className="btn btn-primary btn-sm" onClick={handleStartEditPieces}>
                {t('common.edit')}
              </button>
            )}
          </div>
          <div className="card-body">
            {editingPieces ? (
              <div>
                {pieces.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'start' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('rehearsals.pieceTitle')}
                      value={p.title}
                      onChange={(e) => {
                        const next = [...pieces];
                        next[i].title = e.target.value;
                        setPieces(next);
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('rehearsals.pieceNotesPlaceholder')}
                      value={p.notes}
                      onChange={(e) => {
                        const next = [...pieces];
                        next[i].notes = e.target.value;
                        setPieces(next);
                      }}
                      style={{ flex: 2 }}
                    />
                    <button className="btn btn-outline btn-sm" onClick={() => setPieces(pieces.filter((_, j) => j !== i))}>
                      &times;
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setPieces([...pieces, { title: '', notes: '' }])}>
                    + {t('rehearsals.addPiece')}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleSavePieces}>
                    {t('rehearsals.savePieces')}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditingPieces(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : selectedRehearsal.pieces.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{t('rehearsals.pieceTitle')}</th>
                    <th scope="col">{t('rehearsals.pieceNotes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRehearsal.pieces.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td><strong>{p.title}</strong></td>
                      <td style={{ color: 'var(--text-light)' }}>{p.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="piece-meta">{t('rehearsals.noPieces')}</p>
            )}
          </div>
        </div>

        {/* Attendance */}
        {selectedRehearsal.attendance.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t('rehearsals.attendance')}</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {selectedRehearsal.attendance.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: a.status === 'accepted' ? 'var(--success)' : a.status === 'declined' ? 'var(--danger)' : 'var(--secondary)',
                    }} />
                    <span style={{ fontSize: '0.875rem' }}>{a.member_name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Overview
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>{t('rehearsals.title')}</h1>
        {isManager && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={() => setShowGenerate(!showGenerate)}>
              {t('rehearsals.generate')}
            </button>
            <button className="btn btn-primary" onClick={() => { setForm({ date: '', startTime: '19:30', endTime: '21:30', location: '', type: 'regular', notes: '' }); setEditingId(null); setShowForm(true); }}>
              + {t('rehearsals.addRehearsal')}
            </button>
          </div>
        )}
      </div>

      {/* Generate form */}
      {showGenerate && isManager && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.generate')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-2">{t('rehearsals.generateDescription')}</p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('rehearsals.generateFrom')}</label>
                <input type="date" className="form-control" value={genFrom} onChange={e => setGenFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('rehearsals.generateTo')}</label>
                <input type="date" className="form-control" value={genTo} onChange={e => setGenTo(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={!genFrom || !genTo}>
                {t('rehearsals.generateButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && isManager && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{editingId ? t('rehearsals.editRehearsal') : t('rehearsals.addRehearsal')}</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('rehearsals.date')}</label>
                <input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rehearsals.startTime')}</label>
                <input type="time" className="form-control" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rehearsals.endTime')}</label>
                <input type="time" className="form-control" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('rehearsals.location')}</label>
                <input type="text" className="form-control" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rehearsals.type')}</label>
                <select className="form-control form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="regular">{t('rehearsals.types.regular')}</option>
                  <option value="extra">{t('rehearsals.types.extra')}</option>
                  <option value="cancelled">{t('rehearsals.types.cancelled')}</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">{t('rehearsals.notes')}</label>
              <input type="text" className="form-control" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={handleSaveRehearsal} disabled={!form.date}>
                {t('common.save')}
              </button>
              <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Default days management */}
      {isManager && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.defaultDays')}</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowDefaultForm(!showDefaultForm)}>
              + {t('rehearsals.addDefaultDay')}
            </button>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-2">{t('rehearsals.defaultDaysDescription')}</p>
            {showDefaultForm && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('rehearsals.date')}</label>
                  <select className="form-control form-select" value={defaultForm.dayOfWeek} onChange={e => setDefaultForm({ ...defaultForm, dayOfWeek: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 0].map(d => (
                      <option key={d} value={d}>{t(`rehearsals.days.${d}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('rehearsals.startTime')}</label>
                  <input type="time" className="form-control" value={defaultForm.startTime} onChange={e => setDefaultForm({ ...defaultForm, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('rehearsals.endTime')}</label>
                  <input type="time" className="form-control" value={defaultForm.endTime} onChange={e => setDefaultForm({ ...defaultForm, endTime: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('rehearsals.location')}</label>
                  <input type="text" className="form-control" value={defaultForm.location} onChange={e => setDefaultForm({ ...defaultForm, location: e.target.value })} />
                </div>
                <button className="btn btn-primary" onClick={handleAddDefaultDay}>{t('common.save')}</button>
              </div>
            )}
            {defaultDays.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {defaultDays.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 0.75rem', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', background: 'var(--background)',
                  }}>
                    <strong>{t(`rehearsals.days.${d.day_of_week}`)}</strong>
                    <span>{d.start_time} - {d.end_time}</span>
                    {d.location && <span style={{ color: 'var(--text-light)' }}>· {d.location}</span>}
                    <button className="btn btn-outline btn-sm" onClick={() => handleDeleteDefaultDay(d.id)} style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="piece-meta">{t('rehearsals.noDefaultDays')}</p>
            )}
          </div>
        </div>
      )}

      {/* Rehearsal list */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('rehearsals.upcoming')} ({upcoming.length})</h2>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {upcoming.length > 0 ? (
            <div>
              {upcoming.map(r => (
                <div
                  key={r.id}
                  style={{
                    ...getTypeStyle(r.type),
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleOpenDetail(r.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <strong>{formatDate(r.date, t)}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        {r.start_time} - {r.end_time}
                        {r.location && ` · ${r.location}`}
                      </div>
                    </div>
                    {r.type !== 'regular' && (
                      <span className={`badge badge-${r.type === 'extra' ? 'warning' : 'danger'}`} style={{ fontSize: '0.7rem' }}>
                        {t(`rehearsals.types.${r.type}`)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {r.piece_count > 0 && (
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                        {r.piece_count} {t('rehearsals.pieces').toLowerCase()}
                      </span>
                    )}
                    {(r.accepted_count > 0 || r.declined_count > 0) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        <span style={{ color: 'var(--success)' }}>✓{r.accepted_count}</span>
                        {' '}
                        <span style={{ color: 'var(--danger)' }}>✗{r.declined_count}</span>
                      </span>
                    )}
                    {isManager && (
                      <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-outline btn-sm" onClick={() => handleEdit(r)} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}>
                          {t('common.edit')}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleDelete(r.id)} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--danger)' }}>
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="piece-meta" style={{ padding: '1rem' }}>{t('rehearsals.noRehearsals')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string, t: any): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = t(`rehearsals.days.${date.getDay()}`);
  return `${dayName} ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}
