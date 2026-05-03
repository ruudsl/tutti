import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLoans, createLoan, returnLoan, deleteLoan, getTitleLoanHistory, type Loan, type TitleLoanHistory } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const STATUS_COLORS: Record<string, string> = {
  active: 'badge-info',
  overdue: 'badge-danger',
  returned: 'badge-success',
};

interface LoanStats {
  total: number;
  active: number;
  overdue: number;
  returned: number;
}

interface TitleOption {
  id: string;
  title: string;
  arranger: string | null;
  active_loans: number;
}

export default function Loans() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.loans');
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showNewLoanModal, setShowNewLoanModal] = useState(false);
  const [titleSearch, setTitleSearch] = useState('');
  const [selectedTitle, setSelectedTitle] = useState<TitleOption | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [borrowerOrganization, setBorrowerOrganization] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');

  // Loan history state
  const [historyTitleId, setHistoryTitleId] = useState<string | null>(null);
  const [loanHistory, setLoanHistory] = useState<TitleLoanHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch loans
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['loans', filterStatus],
    queryFn: () => getLoans({ status: filterStatus || undefined }),
  });

  // Fetch stats
  const { data: stats } = useQuery<LoanStats>({
    queryKey: ['loan-stats'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/loans/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
  });

  // Search titles
  const { data: titleOptions = [] } = useQuery<TitleOption[]>({
    queryKey: ['available-titles', titleSearch],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/loans/available-titles?search=${encodeURIComponent(titleSearch)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: showNewLoanModal,
  });

  // Create loan mutation
  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loan-stats'] });
      showSuccess(t('loans.loanCreated'));
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('loans.errorCreatingLoan'));
    },
  });

  // Return loan mutation
  const returnMutation = useMutation({
    mutationFn: returnLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loan-stats'] });
      showSuccess(t('loans.loanReturned'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('loans.errorReturning'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loan-stats'] });
      showSuccess(t('loans.loanDeleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('loans.errorDeleting'));
    },
  });

  const resetForm = () => {
    setShowNewLoanModal(false);
    setTitleSearch('');
    setSelectedTitle(null);
    setBorrowerName('');
    setBorrowerEmail('');
    setBorrowerOrganization('');
    setNotes('');
    setExpectedReturn('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTitle || !borrowerName.trim()) {
      showError(t('loans.selectTitleAndBorrower'));
      return;
    }
    createMutation.mutate({
      musicTitleId: selectedTitle.id,
      borrowerName: borrowerName.trim(),
      borrowerEmail: borrowerEmail.trim() || undefined,
      borrowerOrganization: borrowerOrganization.trim() || undefined,
      notes: notes.trim() || undefined,
      expectedReturn: expectedReturn || undefined,
    });
  };

  const handleReturn = (loan: Loan) => {
    if (confirm(t('loans.confirmReturn', { title: loan.title_name, borrower: loan.borrower_name }))) {
      returnMutation.mutate(loan.id);
    }
  };

  const handleDelete = (loan: Loan) => {
    if (confirm(t('loans.confirmDelete'))) {
      deleteMutation.mutate(loan.id);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isOverdue = (loan: Loan) => {
    if (loan.status === 'returned' || !loan.expected_return) return false;
    return new Date(loan.expected_return) < new Date();
  };

  const handleViewHistory = async (titleId: string) => {
    setHistoryTitleId(titleId);
    setLoadingHistory(true);
    try {
      const history = await getTitleLoanHistory(titleId);
      setLoanHistory(history);
    } catch (error: any) {
      showError(error.response?.data?.error || t('loans.errorLoadingHistory'));
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeHistory = () => {
    setHistoryTitleId(null);
    setLoanHistory(null);
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('loans.title')}</h1>
        <SkeletonTable rows={5} columns={7} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('loans.title')}
          <span className="badge badge-primary badge-title-count">
            {loans.length}
          </span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowNewLoanModal(true)}>
          + {t('loans.newLoan')}
        </button>
      </div>

      {stats && (
        <div className="stat-card-grid">
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--info)' }}>{stats.active}</div>
              <div className="stat-label">{t('loans.status.active')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--danger)' }}>{stats.overdue}</div>
              <div className="stat-label">{t('loans.status.overdue')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--success)' }}>{stats.returned}</div>
              <div className="stat-label">{t('loans.status.returned')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number">{stats.total}</div>
              <div className="stat-label">{t('loans.total')}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-2">
        <div className="card-body">
          <div className="flex gap-2">
            <select
              className="form-control form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="">{t('loans.allStatuses')}</option>
              <option value="active">{t('loans.status.active')}</option>
              <option value="overdue">{t('loans.status.overdue')}</option>
              <option value="returned">{t('loans.status.returned')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flush">
          {loans.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('titles.title')}</th>
                  <th scope="col">{t('loans.borrowedBy')}</th>
                  <th scope="col">{t('loans.borrowerOrganization')}</th>
                  <th scope="col">{t('loans.dateOut')}</th>
                  <th scope="col">{t('loans.expectedReturn')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col" style={{ width: '120px' }}><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} style={isOverdue(loan) ? { backgroundColor: 'var(--danger-light)' } : undefined}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                        <div>
                          <strong>{loan.title_name}</strong>
                          {loan.title_arranger && (
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                              {loan.title_arranger}
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleViewHistory(loan.music_title_id)}
                          title={t('loans.viewHistory')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                        >
                          <Icon name="clock" size={14} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div>{loan.borrower_name}</div>
                      {loan.borrower_email && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          {loan.borrower_email}
                        </div>
                      )}
                    </td>
                    <td>{loan.borrower_organization || '-'}</td>
                    <td>{formatDate(loan.date_out)}</td>
                    <td style={isOverdue(loan) ? { color: 'var(--danger)', fontWeight: 'bold' } : undefined}>
                      {formatDate(loan.expected_return)}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[loan.status]}`}>
                        {t(`loans.status.${loan.status}`)}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {loan.status !== 'returned' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleReturn(loan)}
                            title={t('loans.markAsReturned')}
                          >
                            {t('loans.return')}
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(loan)}
                          title={t('common.delete')}
                        >
                          X
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="package" size={48} /></div>
              <p>{t('loans.noLoans')}</p>
            </div>
          )}
        </div>
      </div>

      {/* New Loan Modal */}
      {showNewLoanModal && (
        <Modal
          title={t('loans.newLoan')}
          onClose={resetForm}
          size="small"
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={resetForm}>
                {t('common.cancel')}
              </button>
              <button type="submit" form="new-loan-form" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('loans.creating') : t('loans.createLoan')}
              </button>
            </>
          }
        >
          <form id="new-loan-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('loans.musicPiece')} *</label>
              {selectedTitle ? (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: 'var(--background)',
                  borderRadius: '0.25rem'
                }}>
                  <div>
                    <strong>{selectedTitle.title}</strong>
                    {selectedTitle.arranger && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-light)' }}>
                        - {selectedTitle.arranger}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedTitle(null)}
                  >
                    {t('loans.change')}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    className="form-control"
                    value={titleSearch}
                    onChange={(e) => setTitleSearch(e.target.value)}
                    placeholder={t('loans.searchTitle')}
                  />
                  {titleOptions.length > 0 && (
                    <div style={{
                      maxHeight: '200px',
                      overflow: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '0.25rem',
                      marginTop: '0.5rem'
                    }}>
                      {titleOptions.map((title) => (
                        <div
                          key={title.id}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)'
                          }}
                          onClick={() => setSelectedTitle(title)}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--background)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <strong>{title.title}</strong>
                          {title.arranger && (
                            <span style={{ marginLeft: '0.5rem', color: 'var(--text-light)' }}>
                              - {title.arranger}
                            </span>
                          )}
                          {title.active_loans > 0 && (
                            <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>
                              {t('loans.timesLoaned', { count: title.active_loans })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">{t('loans.borrowerName')} *</label>
              <input
                type="text"
                className="form-control"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder={t('loans.borrowerNamePlaceholder')}
                required
              />
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('loans.borrowerEmail')}</label>
                <input
                  type="email"
                  className="form-control"
                  value={borrowerEmail}
                  onChange={(e) => setBorrowerEmail(e.target.value)}
                  placeholder={t('loans.borrowerEmailPlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('loans.borrowerOrganization')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={borrowerOrganization}
                  onChange={(e) => setBorrowerOrganization(e.target.value)}
                  placeholder={t('loans.borrowerOrgPlaceholder')}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('loans.expectedReturnDate')}</label>
              <input
                type="date"
                className="form-control"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('loans.notes')}</label>
              <textarea
                className="form-control"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('loans.notesPlaceholder')}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Loan History Modal */}
      {historyTitleId && (
        <Modal
          title={t('loans.loanHistory')}
          onClose={closeHistory}
          size="large"
        >
          {loadingHistory ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : loanHistory ? (
            <div>
              {/* Title info */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--background)', borderRadius: 'var(--radius-sm)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0' }}>{loanHistory.title.title}</h3>
                {loanHistory.title.arranger && (
                  <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
                    {loanHistory.title.arranger}
                  </div>
                )}
              </div>

              {/* Statistics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{loanHistory.statistics.totalLoans}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{t('loans.history.totalLoans')}</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--info)' }}>{loanHistory.statistics.activeLoans}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{t('loans.history.activeLoans')}</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{loanHistory.statistics.avgLoanDurationDays} {t('loans.history.days')}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{t('loans.history.avgDuration')}</div>
                  </div>
                </div>
              </div>

              {/* Loan history table */}
              {loanHistory.loans.length > 0 ? (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">{t('loans.borrowedBy')}</th>
                        <th scope="col">{t('loans.dateOut')}</th>
                        <th scope="col">{t('loans.dateReturned')}</th>
                        <th scope="col">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanHistory.loans.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <div>{entry.borrowerName}</div>
                            {entry.borrowerOrganization && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                {entry.borrowerOrganization}
                              </div>
                            )}
                          </td>
                          <td>{formatDate(entry.dateOut)}</td>
                          <td>{entry.dateReturned ? formatDate(entry.dateReturned) : '-'}</td>
                          <td>
                            <span className={`badge ${STATUS_COLORS[entry.status]}`}>
                              {t(`loans.status.${entry.status}`)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <p>{t('loans.history.noHistory')}</p>
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
