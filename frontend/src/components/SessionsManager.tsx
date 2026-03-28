import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getSessions, revokeSession, revokeAllSessions } from '../api';
import { queryKeys } from '../lib/queryClient';
import { showSuccess, showError } from '../utils/toast';

export function SessionsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: getSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      showSuccess(t('sessions.revoked'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Error revoking session');
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      showSuccess(`${t('sessions.allRevoked')} (${data.revokedCount})`);
      setConfirmRevokeAll(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Error revoking sessions');
    },
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const parseUserAgent = (ua: string | null): string => {
    if (!ua) return 'Unknown device';

    // Simple UA parsing
    if (ua.includes('Mobile')) return 'Mobile device';
    if (ua.includes('Chrome')) return 'Chrome browser';
    if (ua.includes('Firefox')) return 'Firefox browser';
    if (ua.includes('Safari')) return 'Safari browser';
    if (ua.includes('Edge')) return 'Edge browser';
    return 'Web browser';
  };

  if (isLoading) {
    return <div className="skeleton" style={{ height: '100px' }} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3>{t('sessions.title')}</h3>
        {sessions.length > 1 && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setConfirmRevokeAll(true)}
            disabled={revokeAllMutation.isPending}
          >
            {t('sessions.revokeAll')}
          </button>
        )}
      </div>

      {confirmRevokeAll && (
        <div className="alert alert-warning mb-2">
          <p>{t('sessions.revokeAllConfirm')}</p>
          <div className="flex gap-1 mt-1">
            <button
              className="btn btn-danger btn-sm"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
            >
              {revokeAllMutation.isPending ? '...' : t('common.confirm')}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setConfirmRevokeAll(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>{t('sessions.lastActive')}</th>
              <th>{t('sessions.expiresAt')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <div>
                    <strong>{parseUserAgent(session.userAgent)}</strong>
                    {session.isCurrent && (
                      <span
                        className="badge badge-success"
                        style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}
                      >
                        {t('sessions.current')}
                      </span>
                    )}
                  </div>
                  {session.ipAddress && (
                    <small style={{ color: 'var(--text-light)' }}>
                      IP: {session.ipAddress}
                    </small>
                  )}
                </td>
                <td>{formatDate(session.lastActive)}</td>
                <td>{formatDate(session.expiresAt)}</td>
                <td>
                  {!session.isCurrent && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => revokeMutation.mutate(session.id)}
                      disabled={revokeMutation.isPending}
                    >
                      {t('sessions.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessions.length === 0 && (
        <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>
          No active sessions found.
        </p>
      )}
    </div>
  );
}
