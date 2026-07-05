import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMemberDirectory, getOrchestras, getInstruments } from '../api';
import { useDownloadToken } from '../utils/downloadUrl';
import { Avatar } from '../components/Avatar';
import { SectionChat } from '../components/SectionChat';
import { VirtualizedList, VirtualizedListItem } from '../components/VirtualizedList';
import './MemberDirectory.css';

// Helper to get photo URL with a short-lived download token for img src
const getPhotoUrl = (photoUrl: string | null | undefined, downloadToken: string | null): string | null => {
  if (!photoUrl || !downloadToken) return null;
  return `${photoUrl}?token=${encodeURIComponent(downloadToken)}`;
};

export default function MemberDirectory() {
  const { t } = useTranslation();
  const downloadToken = useDownloadToken();
  const [search, setSearch] = useState('');
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['memberDirectory', selectedOrchestra, selectedInstrument, search],
    queryFn: () =>
      getMemberDirectory({
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

  return (
    <div className="member-directory-page">
      <div className="page-header">
        <h1>{t('memberDirectory.title')}</h1>
        <p className="page-subtitle">{t('memberDirectory.subtitle', { count: members.length })}</p>
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
              {orchestras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
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
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.tuning ? ` (${i.tuning})` : ''}
                </option>
              ))}
            </select>
          </div>

          {(search || selectedOrchestra || selectedInstrument) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearch('');
                setSelectedOrchestra('');
                setSelectedInstrument('');
              }}
            >
              {t('memberDirectory.clearFilters')}
            </button>
          )}

          <div className="filter-group" style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode('grid')}
              title={t('memberDirectory.gridView')}
            >
              {t('memberDirectory.grid', 'Grid')}
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode('list')}
              title={t('memberDirectory.listView')}
            >
              {t('memberDirectory.list', 'List')}
            </button>
            <button
              className={`btn btn-sm ${showChat ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowChat(!showChat)}
              title={t('memberDirectory.sectionChat', 'Section Chat')}
            >
              {t('memberDirectory.chat', 'Chat')}
            </button>
          </div>
        </div>
      </div>

      <div className={`member-directory-content ${showChat ? 'with-chat' : ''}`}>
        <div className="member-directory-main">
          {isLoading ? (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : members.length === 0 ? (
            <div className="empty-state">
              <p>{t('memberDirectory.noMembers')}</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="directory-grid">
              {members.map((member) => (
                <div key={member.id} className="member-card">
                  <div className="member-avatar">
                    <Avatar
                      name={`${member.firstName} ${member.lastName}`}
                      src={getPhotoUrl(member.photoUrl, downloadToken)}
                      size="xl"
                    />
                  </div>
                  <div className="member-info">
                    <h3 className="member-name">
                      {member.firstName} {member.lastName}
                    </h3>
                    {member.instruments.length > 0 && (
                      <p className="member-instrument">{member.instruments.map((i) => i.name).join(', ')}</p>
                    )}
                    {member.orchestras.length > 0 && (
                      <div className="member-orchestras">
                        {member.orchestras.map((o) => (
                          <span key={o.id} className="orchestra-badge">
                            {o.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* VirtualizedList view for better performance with large member lists */
            <VirtualizedList
              items={members}
              itemHeight={80}
              height={600}
              emptyMessage={t('memberDirectory.noMembers')}
              loading={isLoading}
              renderItem={(member, _index, style) => (
                <VirtualizedListItem key={member.id} style={style}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <Avatar
                      name={`${member.firstName} ${member.lastName}`}
                      src={getPhotoUrl(member.photoUrl, downloadToken)}
                      size="md"
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        {member.firstName} {member.lastName}
                      </div>
                      {member.instruments.length > 0 && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                          {member.instruments.map((i) => i.name).join(', ')}
                        </div>
                      )}
                    </div>
                    {member.orchestras.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {member.orchestras.map((o) => (
                          <span key={o.id} className="orchestra-badge" style={{ fontSize: '0.75rem' }}>
                            {o.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </VirtualizedListItem>
              )}
            />
          )}
        </div>

        {/* Section Chat sidebar */}
        {showChat && (
          <div className="member-directory-chat">
            <SectionChat orchestraId={selectedOrchestra || undefined} />
          </div>
        )}
      </div>
    </div>
  );
}
