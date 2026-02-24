import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMemberDirectory, getOrchestras, getInstruments } from '../api';
import { STORAGE_KEYS } from '../utils/constants';
import './MemberDirectory.css';

// Helper to get photo URL with auth token for img src
const getPhotoUrl = (photoUrl: string | null | undefined): string | null => {
  if (!photoUrl) return null;
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return token ? `${photoUrl}?token=${token}` : null;
};

export default function MemberDirectory() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState('');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['memberDirectory', selectedOrchestra, selectedInstrument, search],
    queryFn: () => getMemberDirectory({
      orchestraId: selectedOrchestra || undefined,
      instrumentId: selectedInstrument || undefined,
      search: search || undefined,
    }),
  });

  const { data: orchestras = [] } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ['instruments'],
    queryFn: getInstruments,
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <div className="member-directory-page">
      <div className="page-header">
        <h1>{t('memberDirectory.title')}</h1>
        <p className="page-subtitle">
          {t('memberDirectory.subtitle', { count: members.length })}
        </p>
      </div>

      <div className="directory-filters">
        <div className="filter-row">
          <div className="filter-group search-group">
            <input
              type="text"
              className="form-control"
              placeholder={t('memberDirectory.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <select
              className="form-control"
              value={selectedOrchestra}
              onChange={(e) => setSelectedOrchestra(e.target.value)}
            >
              <option value="">{t('memberDirectory.allOrchestras')}</option>
              {orchestras.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <select
              className="form-control"
              value={selectedInstrument}
              onChange={(e) => setSelectedInstrument(e.target.value)}
            >
              <option value="">{t('memberDirectory.allInstruments')}</option>
              {instruments.map(i => (
                <option key={i.id} value={i.id}>{i.name}{i.tuning ? ` (${i.tuning})` : ''}</option>
              ))}
            </select>
          </div>

          {(search || selectedOrchestra || selectedInstrument) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => { setSearch(''); setSelectedOrchestra(''); setSelectedInstrument(''); }}
            >
              {t('memberDirectory.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : members.length === 0 ? (
        <div className="empty-state">
          <p>{t('memberDirectory.noMembers')}</p>
        </div>
      ) : (
        <div className="directory-grid">
          {members.map(member => (
            <div key={member.id} className="member-card">
              <div className="member-avatar">
                {getPhotoUrl(member.photoUrl) ? (
                  <img
                    src={getPhotoUrl(member.photoUrl)!}
                    alt={`${member.firstName} ${member.lastName}`}
                    className="avatar-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={`avatar-initials ${getPhotoUrl(member.photoUrl) ? 'hidden' : ''}`}>
                  {getInitials(member.firstName, member.lastName)}
                </span>
              </div>
              <div className="member-info">
                <h3 className="member-name">{member.firstName} {member.lastName}</h3>
                {member.instruments.length > 0 && (
                  <p className="member-instrument">
                    {member.instruments.map(i => i.name).join(', ')}
                  </p>
                )}
                {member.orchestras.length > 0 && (
                  <div className="member-orchestras">
                    {member.orchestras.map(o => (
                      <span key={o.id} className="orchestra-badge">{o.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
