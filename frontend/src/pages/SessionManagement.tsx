import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon, type IconName } from '../components/Icon';
import { UAParser } from 'ua-parser-js';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActive: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

async function getSessions(): Promise<Session[]> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

async function revokeSession(sessionId: string): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to revoke session');
}

async function revokeAllSessions(): Promise<{ revokedCount: number }> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/sessions/all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to revoke sessions');
  return res.json();
}

function parseUserAgent(userAgent: string | null): {
  device: string;
  browser: string;
  os: string;
  icon: IconName;
} {
  if (!userAgent) {
    return { device: 'Unknown', browser: '', os: '', icon: 'laptop' };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const device = result.device.type || 'desktop';
  const browser = result.browser.name || 'Unknown';
  const os = result.os.name || 'Unknown';

  let icon: IconName = 'laptop';
  if (device === 'mobile' || device === 'tablet') icon = 'smartphone';
  else if (os?.toLowerCase().includes('mac')) icon = 'monitor';
  else if (os?.toLowerCase().includes('windows')) icon = 'monitor';
  else if (os?.toLowerCase().includes('linux')) icon = 'monitor';

  return {
    device: device === 'desktop' ? `${browser} on ${os}` : `${device} - ${browser}`,
    browser,
    os,
    icon,
  };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

export default function SessionManagement() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.sessions');
  const queryClient = useQueryClient();

  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);

  const {
    data: sessions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: getSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      showSuccess(t('sessions.sessionRevoked'));
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setSessionToRevoke(null);
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: (data) => {
      showSuccess(t('sessions.allSessionsRevoked', { count: data.revokedCount }));
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setConfirmRevokeAll(false);
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-danger">{t('errors.generic')}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('sessions.title')}</h1>
        {otherSessions.length > 0 && (
          <button
            className="btn btn-danger"
            onClick={() => setConfirmRevokeAll(true)}
            disabled={revokeAllMutation.isPending}
          >
            {t('sessions.revokeAll')}
          </button>
        )}
      </div>

      <p className="piece-meta mb-3">{t('sessions.description')}</p>

      <div className="flex flex-col gap-2">
        {sessions.map((session) => {
          const ua = parseUserAgent(session.userAgent);

          return (
            <div key={session.id} className={`session-card ${session.isCurrent ? 'current' : ''}`}>
              <div className="session-info">
                <span className="session-icon">
                  <Icon name={ua.icon} size={24} />
                </span>
                <div className="session-details">
                  <div className="session-device">
                    {ua.device}
                    {session.isCurrent && <span className="session-current-badge">{t('sessions.currentSession')}</span>}
                  </div>
                  <div className="session-meta">
                    <span>
                      {t('sessions.lastActive')}: {formatRelativeTime(session.lastActive || session.createdAt)}
                    </span>
                    {session.ipAddress && (
                      <span>
                        {t('sessions.ipAddress')}: {session.ipAddress}
                      </span>
                    )}
                    <span>
                      {t('sessions.createdAt')}: {new Date(session.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setSessionToRevoke(session)}
                  disabled={revokeMutation.isPending}
                >
                  {t('sessions.revoke')}
                </button>
              )}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="lock" size={48} />
            </div>
            <p>{t('sessions.noSessions')}</p>
          </div>
        )}
      </div>

      {/* Confirm revoke single session */}
      {sessionToRevoke && (
        <ConfirmDialog
          title={t('sessions.revokeConfirmTitle')}
          message={t('sessions.revokeConfirmMessage')}
          confirmLabel={t('sessions.revoke')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => revokeMutation.mutate(sessionToRevoke.id)}
          onCancel={() => setSessionToRevoke(null)}
          isLoading={revokeMutation.isPending}
          variant="danger"
        />
      )}

      {/* Confirm revoke all sessions */}
      {confirmRevokeAll && (
        <ConfirmDialog
          title={t('sessions.revokeAllConfirmTitle')}
          message={t('sessions.revokeAllConfirmMessage', { count: otherSessions.length })}
          confirmLabel={t('sessions.revokeAll')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => revokeAllMutation.mutate()}
          onCancel={() => setConfirmRevokeAll(false)}
          isLoading={revokeAllMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
