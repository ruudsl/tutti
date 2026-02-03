import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getIssues, getMyIssues, getIssueStats, updateIssueStatus, deleteIssue, type PieceIssue, type IssueStats } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_review: 'In behandeling',
  resolved: 'Opgelost',
  rejected: 'Afgewezen',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'badge-warning',
  in_review: 'badge-info',
  resolved: 'badge-success',
  rejected: 'badge-danger',
};

export default function Issues() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedIssue, setSelectedIssue] = useState<PieceIssue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const isMusicCommittee = user?.role === 'music_committee' || user?.role === 'admin';

  // Fetch issues based on user role
  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ['issues', filterStatus, isMusicCommittee],
    queryFn: () => isMusicCommittee
      ? getIssues({ status: filterStatus || undefined })
      : getMyIssues(),
  });

  // Fetch stats for music committee
  const { data: stats } = useQuery({
    queryKey: ['issue-stats'],
    queryFn: getIssueStats,
    enabled: isMusicCommittee,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      updateIssueStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['issue-stats'] });
      showSuccess('Status bijgewerkt');
      setSelectedIssue(null);
      setResolutionNotes('');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij bijwerken status');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['issue-stats'] });
      showSuccess('Melding verwijderd');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij verwijderen');
    },
  });

  const handleStatusChange = (issue: PieceIssue, newStatus: string) => {
    if (newStatus === 'resolved' || newStatus === 'rejected') {
      setSelectedIssue(issue);
      setResolutionNotes('');
    } else {
      updateStatusMutation.mutate({ id: issue.id, status: newStatus });
    }
  };

  const handleResolve = () => {
    if (!selectedIssue) return;
    updateStatusMutation.mutate({
      id: selectedIssue.id,
      status: selectedIssue.status === 'rejected' ? 'rejected' : 'resolved',
      notes: resolutionNotes,
    });
  };

  const handleDelete = (issue: PieceIssue) => {
    if (confirm('Weet je zeker dat je deze melding wilt verwijderen?')) {
      deleteMutation.mutate(issue.id);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (issuesLoading) {
    return (
      <div>
        <h1>Meldkamer</h1>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          Meldkamer
          <span className="badge badge-primary" style={{ marginLeft: '0.75rem', fontSize: '1rem', verticalAlign: 'middle' }}>
            {issues.length}
          </span>
        </h1>
      </div>

      {isMusicCommittee && stats && (
        <div className="grid grid-4 mb-3" style={{ gap: '1rem' }}>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning)' }}>{stats.open}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Open</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--info)' }}>{stats.in_review}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>In behandeling</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{stats.resolved}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Opgelost</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>{stats.rejected}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Afgewezen</div>
            </div>
          </div>
        </div>
      )}

      {isMusicCommittee && (
        <div className="card mb-2">
          <div className="card-body">
            <div className="flex gap-2">
              <select
                className="form-control form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ maxWidth: '200px' }}
              >
                <option value="">Alle statussen</option>
                <option value="open">Open</option>
                <option value="in_review">In behandeling</option>
                <option value="resolved">Opgelost</option>
                <option value="rejected">Afgewezen</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {issues.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Muziekstuk</th>
                  <th>Locatie</th>
                  <th>Beschrijving</th>
                  {isMusicCommittee && <th>Gemeld door</th>}
                  <th>Datum</th>
                  <th>Status</th>
                  <th style={{ width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <strong>{issue.piece_title}</strong>
                      {issue.piece_arranger && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                          {issue.piece_arranger}
                        </div>
                      )}
                      {issue.instrument_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          {issue.instrument_name}
                        </div>
                      )}
                    </td>
                    <td>
                      {issue.page_number && <div>Pag. {issue.page_number}</div>}
                      {issue.measure_number && <div>Maat {issue.measure_number}</div>}
                      {!issue.page_number && !issue.measure_number && '-'}
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{issue.description}</div>
                      {issue.resolution_notes && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: 'var(--background)',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem'
                        }}>
                          <strong>Reactie:</strong> {issue.resolution_notes}
                        </div>
                      )}
                    </td>
                    {isMusicCommittee && (
                      <td>
                        <div>{issue.reported_by_name}</div>
                        {issue.reported_by_email && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                            {issue.reported_by_email}
                          </div>
                        )}
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(issue.created_at)}
                    </td>
                    <td>
                      {isMusicCommittee && issue.status !== 'resolved' && issue.status !== 'rejected' ? (
                        <select
                          className={`form-control form-select ${STATUS_COLORS[issue.status]}`}
                          value={issue.status}
                          onChange={(e) => handleStatusChange(issue, e.target.value)}
                          style={{ minWidth: '140px' }}
                        >
                          <option value="open">Open</option>
                          <option value="in_review">In behandeling</option>
                          <option value="resolved">Opgelost</option>
                          <option value="rejected">Afgewezen</option>
                        </select>
                      ) : (
                        <span className={`badge ${STATUS_COLORS[issue.status]}`}>
                          {STATUS_LABELS[issue.status]}
                        </span>
                      )}
                    </td>
                    <td>
                      {(user?.role === 'admin' || (issue.status === 'open')) && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(issue)}
                          title="Verwijderen"
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>Geen meldingen gevonden.</p>
            </div>
          )}
        </div>
      </div>

      {/* Resolution Modal */}
      {selectedIssue && (
        <div className="modal-overlay" onClick={() => setSelectedIssue(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedIssue.status === 'rejected' ? 'Melding afwijzen' : 'Melding oplossen'}
              </h3>
              <button className="modal-close" onClick={() => setSelectedIssue(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Muziekstuk</label>
                <p><strong>{selectedIssue.piece_title}</strong></p>
              </div>
              <div className="form-group">
                <label className="form-label">Originele melding</label>
                <p style={{ whiteSpace: 'pre-wrap' }}>{selectedIssue.description}</p>
              </div>
              <div className="form-group">
                <label className="form-label">Reactie / Toelichting (optioneel)</label>
                <textarea
                  className="form-control"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  placeholder="Leg uit wat er is opgelost of waarom de melding is afgewezen..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedIssue(null)}>
                Annuleren
              </button>
              <div className="flex gap-2">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    updateStatusMutation.mutate({
                      id: selectedIssue.id,
                      status: 'rejected',
                      notes: resolutionNotes,
                    });
                  }}
                >
                  Afwijzen
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => {
                    updateStatusMutation.mutate({
                      id: selectedIssue.id,
                      status: 'resolved',
                      notes: resolutionNotes,
                    });
                  }}
                >
                  Opgelost
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
