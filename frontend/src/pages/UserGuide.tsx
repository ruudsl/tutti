import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { Icon } from '../components/Icon';

interface GuideSection {
  id: string;
  titleKey: string;
  contentKey: string;
  roles?: string[];
}

const guideSections: GuideSection[] = [
  {
    id: 'getting-started',
    titleKey: 'userGuide.sections.gettingStarted.title',
    contentKey: 'userGuide.sections.gettingStarted.content',
  },
  {
    id: 'my-music',
    titleKey: 'userGuide.sections.myMusic.title',
    contentKey: 'userGuide.sections.myMusic.content',
  },
  {
    id: 'download-music',
    titleKey: 'userGuide.sections.downloadMusic.title',
    contentKey: 'userGuide.sections.downloadMusic.content',
  },
  {
    id: 'report-issues',
    titleKey: 'userGuide.sections.reportIssues.title',
    contentKey: 'userGuide.sections.reportIssues.content',
  },
  {
    id: 'rehearsals',
    titleKey: 'userGuide.sections.rehearsals.title',
    contentKey: 'userGuide.sections.rehearsals.content',
  },
  {
    id: 'tools',
    titleKey: 'userGuide.sections.tools.title',
    contentKey: 'userGuide.sections.tools.content',
  },
  {
    id: 'profile',
    titleKey: 'userGuide.sections.profile.title',
    contentKey: 'userGuide.sections.profile.content',
  },
  {
    id: 'upload-music',
    titleKey: 'userGuide.sections.uploadMusic.title',
    contentKey: 'userGuide.sections.uploadMusic.content',
    roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
  },
  {
    id: 'manage-lists',
    titleKey: 'userGuide.sections.manageLists.title',
    contentKey: 'userGuide.sections.manageLists.content',
    roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
  },
  {
    id: 'manage-members',
    titleKey: 'userGuide.sections.manageMembers.title',
    contentKey: 'userGuide.sections.manageMembers.content',
    roles: [ROLES.ADMIN],
  },
];

export default function UserGuide() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.userGuide');

  const [activeSection, setActiveSection] = useState('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sections based on user role
  const visibleSections = guideSections.filter((section) => {
    if (!section.roles) return true;
    return user && section.roles.includes(user.role);
  });

  // Filter by search query
  const filteredSections = visibleSections.filter((section) => {
    if (!searchQuery) return true;
    const title = t(section.titleKey).toLowerCase();
    const content = t(section.contentKey).toLowerCase();
    return title.includes(searchQuery.toLowerCase()) || content.includes(searchQuery.toLowerCase());
  });

  const currentSection = filteredSections.find((s) => s.id === activeSection) || filteredSections[0];

  return (
    <div className="user-guide">
      <div className="user-guide-header">
        <h1>{t('userGuide.title')}</h1>
        <p className="text-light">{t('userGuide.subtitle')}</p>
      </div>

      <div className="user-guide-search">
        <input
          type="text"
          className="form-control"
          placeholder={t('userGuide.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t('userGuide.searchPlaceholder')}
        />
      </div>

      <div className="user-guide-layout">
        <nav className="user-guide-nav" aria-label={t('userGuide.navigation')}>
          <ul className="user-guide-nav-list">
            {filteredSections.map((section) => (
              <li key={section.id}>
                <button
                  className={`user-guide-nav-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                >
                  {t(section.titleKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <article className="user-guide-content">
          {currentSection && (
            <>
              <h2>{t(currentSection.titleKey)}</h2>
              <div
                className="user-guide-text"
                dangerouslySetInnerHTML={{ __html: t(currentSection.contentKey) }}
              />
            </>
          )}

          {filteredSections.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="book" size={48} />
              </div>
              <p>{t('userGuide.noResults')}</p>
            </div>
          )}
        </article>
      </div>

      <div className="user-guide-footer">
        <p className="text-light text-sm">
          {t('userGuide.needHelp')}{' '}
          <a href="https://github.com/ruudsl/harmonie/issues" target="_blank" rel="noopener noreferrer">
            {t('userGuide.contactSupport')}
          </a>
        </p>
      </div>
    </div>
  );
}
