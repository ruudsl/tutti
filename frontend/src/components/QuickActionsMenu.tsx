import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  path?: string;
  onClick?: () => void;
  shortcut?: string;
  requiresRole?: string[];
}

interface QuickActionsMenuProps {
  onOpenSearch?: () => void;
}

// Context-aware actions based on current page
const getContextActions = (
  pathname: string,
  t: (key: string) => string,
  _userRole: string,
  onOpenSearch?: () => void
): QuickAction[] => {
  const commonActions: QuickAction[] = [
    {
      id: 'search',
      label: t('quickActions.search'),
      icon: '\u2315',
      onClick: onOpenSearch,
      shortcut: 'K',
    },
  ];

  // Dashboard actions
  if (pathname === '/' || pathname === '/dashboard') {
    return [
      ...commonActions,
      {
        id: 'newList',
        label: t('quickActions.newList'),
        icon: '+',
        path: '/lists?action=new',
        requiresRole: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
      },
      {
        id: 'upload',
        label: t('quickActions.upload'),
        icon: '\u2191',
        path: '/upload',
        requiresRole: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
      },
      {
        id: 'rehearsals',
        label: t('quickActions.viewRehearsals'),
        icon: '\u2315',
        path: '/rehearsals',
      },
      {
        id: 'myMusic',
        label: t('quickActions.myMusic'),
        icon: '\u266A',
        path: '/my-music',
      },
    ];
  }

  // My Music page actions
  if (pathname.startsWith('/my-music')) {
    return [
      ...commonActions,
      {
        id: 'downloadAll',
        label: t('quickActions.downloadAll'),
        icon: '\u2193',
        onClick: () => {
          // Dispatch custom event for download all
          window.dispatchEvent(new CustomEvent('quick-action-download-all'));
        },
      },
      {
        id: 'reportIssue',
        label: t('quickActions.reportIssue'),
        icon: '!',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-report-issue'));
        },
      },
      {
        id: 'favorites',
        label: t('quickActions.viewFavorites'),
        icon: '\u2605',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-view-favorites'));
        },
      },
    ];
  }

  // Music lists page actions
  if (pathname.startsWith('/lists')) {
    return [
      ...commonActions,
      {
        id: 'addPiece',
        label: t('quickActions.addPiece'),
        icon: '+',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-add-piece'));
        },
        requiresRole: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
      },
      {
        id: 'exportList',
        label: t('quickActions.exportList'),
        icon: '\u2193',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-export-list'));
        },
      },
      {
        id: 'printList',
        label: t('quickActions.printList'),
        icon: '\u2399',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-print-list'));
        },
      },
    ];
  }

  // Titles page actions
  if (pathname.startsWith('/titles') || pathname.startsWith('/music-pieces')) {
    return [
      ...commonActions,
      {
        id: 'upload',
        label: t('quickActions.upload'),
        icon: '\u2191',
        path: '/upload',
        requiresRole: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
      },
      {
        id: 'newTitle',
        label: t('quickActions.newTitle'),
        icon: '+',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-new-title'));
        },
        requiresRole: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE],
      },
    ];
  }

  // Rehearsals page actions
  if (pathname.startsWith('/rehearsals')) {
    return [
      ...commonActions,
      {
        id: 'newRehearsal',
        label: t('quickActions.newRehearsal'),
        icon: '+',
        path: '/rehearsals?action=new',
        requiresRole: [ROLES.ADMIN, ROLES.CONDUCTOR],
      },
      {
        id: 'viewCalendar',
        label: t('quickActions.viewCalendar'),
        icon: '\u2315',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-calendar-view'));
        },
      },
    ];
  }

  // Members page actions
  if (pathname.startsWith('/members')) {
    return [
      ...commonActions,
      {
        id: 'newMember',
        label: t('quickActions.newMember'),
        icon: '+',
        path: '/users?action=new',
        requiresRole: [ROLES.ADMIN],
      },
      {
        id: 'exportMembers',
        label: t('quickActions.exportMembers'),
        icon: '\u2193',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-export-members'));
        },
        requiresRole: [ROLES.ADMIN],
      },
    ];
  }

  // Equipment/Uniforms pages
  if (pathname.startsWith('/equipment') || pathname.startsWith('/uniforms')) {
    return [
      ...commonActions,
      {
        id: 'newItem',
        label: t('quickActions.newItem'),
        icon: '+',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-new-item'));
        },
        requiresRole: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE, ROLES.UNIFORMS_COMMITTEE],
      },
      {
        id: 'newLoan',
        label: t('quickActions.newLoan'),
        icon: '\u2194',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-new-loan'));
        },
        requiresRole: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE, ROLES.UNIFORMS_COMMITTEE],
      },
    ];
  }

  // Tools page actions
  if (pathname.startsWith('/tools')) {
    return [
      ...commonActions,
      {
        id: 'metronome',
        label: t('quickActions.metronome'),
        icon: '\u266A',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-metronome'));
        },
      },
      {
        id: 'tuner',
        label: t('quickActions.tuner'),
        icon: '\u266B',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('quick-action-tuner'));
        },
      },
    ];
  }

  // Default actions for other pages
  return [
    ...commonActions,
    {
      id: 'home',
      label: t('quickActions.home'),
      icon: '\u2302',
      path: '/',
    },
    {
      id: 'myMusic',
      label: t('quickActions.myMusic'),
      icon: '\u266A',
      path: '/my-music',
    },
    {
      id: 'lists',
      label: t('quickActions.lists'),
      icon: '\u2630',
      path: '/lists',
    },
    {
      id: 'rehearsals',
      label: t('quickActions.rehearsals'),
      icon: '\u2315',
      path: '/rehearsals',
    },
  ];
};

export function QuickActionsMenu({ onOpenSearch }: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Get context-aware actions
  const allActions = getContextActions(location.pathname, t, user?.role || 'member', onOpenSearch);

  // Filter actions based on user role
  const actions = allActions.filter(action => {
    if (!action.requiresRole) return true;
    if (!user?.role) return false;
    return action.requiresRole.includes(user.role) || user.role === ROLES.ADMIN;
  });

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        fabRef.current &&
        !fabRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ctrl+. to toggle quick actions
      if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        return;
      }

      // Handle shortcuts when menu is open
      if (isOpen) {
        // Escape to close
        if (e.key === 'Escape') {
          setIsOpen(false);
          fabRef.current?.focus();
          return;
        }

        // Arrow navigation
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev < actions.length - 1 ? prev + 1 : 0));
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : actions.length - 1));
          return;
        }

        // Enter to select
        if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          handleAction(actions[selectedIndex]);
          return;
        }

        // Shortcut keys
        const action = actions.find(
          a => a.shortcut?.toLowerCase() === e.key.toLowerCase()
        );
        if (action) {
          e.preventDefault();
          handleAction(action);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, actions, selectedIndex]);

  // Reset selection when actions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [location.pathname]);

  // Handle action execution
  const handleAction = useCallback((action: QuickAction) => {
    setIsOpen(false);
    setSelectedIndex(-1);

    if (action.onClick) {
      action.onClick();
    } else if (action.path) {
      navigate(action.path);
    }
  }, [navigate]);

  // Toggle menu
  const toggleMenu = useCallback(() => {
    setIsOpen(prev => !prev);
    setSelectedIndex(-1);
  }, []);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="quick-actions-backdrop"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Action Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="quick-actions-menu"
          role="menu"
          aria-label={t('quickActions.title', 'Snelle acties')}
        >
          <div className="quick-actions-header">
            <span className="quick-actions-title">{t('quickActions.title', 'Snelle acties')}</span>
            <span className="quick-actions-context">
              {t('quickActions.contextHint', 'Acties voor deze pagina')}
            </span>
          </div>
          <ul className="quick-actions-list">
            {actions.map((action, index) => (
              <li key={action.id}>
                <button
                  className={`quick-action-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleAction(action)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="menuitem"
                  tabIndex={-1}
                >
                  <span className="quick-action-icon" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="quick-action-label">{action.label}</span>
                  {action.shortcut && (
                    <kbd className="quick-action-shortcut">
                      {action.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="quick-actions-footer">
            <span><kbd>{'\u2191'}</kbd><kbd>{'\u2193'}</kbd> navigeren</span>
            <span><kbd>Enter</kbd> selecteren</span>
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        ref={fabRef}
        className={`quick-actions-fab ${isOpen ? 'open' : ''}`}
        onClick={toggleMenu}
        aria-label={t('quickActions.title', 'Snelle acties')}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={`${t('quickActions.title', 'Snelle acties')} (Ctrl+.)`}
      >
        <span className="fab-icon" aria-hidden="true">
          {isOpen ? '\u2715' : '+'}
        </span>
      </button>
    </>
  );
}

export default QuickActionsMenu;
