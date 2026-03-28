import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  path?: string;
  onClick?: () => void;
  shortcut?: string;
}

interface QuickActionsProps {
  actions?: QuickAction[];
}

const defaultActions: QuickAction[] = [
  { id: 'upload', label: 'quickActions.upload', icon: '+', path: '/upload', shortcut: 'U' },
  { id: 'search', label: 'quickActions.search', icon: '?', path: '/titles', shortcut: '/' },
  { id: 'mymusic', label: 'quickActions.myMusic', icon: '?', path: '/my-music', shortcut: 'M' },
  { id: 'lists', label: 'quickActions.lists', icon: '?', path: '/lists', shortcut: 'L' },
  { id: 'rehearsals', label: 'quickActions.rehearsals', icon: '?', path: '/rehearsals', shortcut: 'R' },
];

export function QuickActions({ actions = defaultActions }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

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

      // Toggle quick actions with Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      // Handle action shortcuts when menu is open
      if (isOpen) {
        const action = actions.find(
          (a) => a.shortcut?.toLowerCase() === e.key.toLowerCase()
        );
        if (action) {
          e.preventDefault();
          handleAction(action);
        }

        // Close on Escape
        if (e.key === 'Escape') {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, actions]);

  const handleAction = (action: QuickAction) => {
    setIsOpen(false);
    if (action.onClick) {
      action.onClick();
    } else if (action.path) {
      navigate(action.path);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 998,
          }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Action Menu */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '1.5rem',
            background: 'var(--surface)',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            padding: '0.5rem',
            zIndex: 999,
            minWidth: '200px',
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.875rem',
                color: 'var(--text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--background)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{action.icon}</span>
              <span style={{ flex: 1 }}>{t(action.label)}</span>
              {action.shortcut && (
                <kbd
                  style={{
                    padding: '0.125rem 0.375rem',
                    background: 'var(--background)',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-light)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {action.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          cursor: 'pointer',
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          transition: 'transform 0.2s, background 0.2s',
          transform: isOpen ? 'rotate(45deg)' : 'none',
        }}
        title={t('quickActions.title') + ' (Ctrl+K)'}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(45deg) scale(1.1)' : 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(45deg)' : 'none';
        }}
      >
        +
      </button>
    </>
  );
}
