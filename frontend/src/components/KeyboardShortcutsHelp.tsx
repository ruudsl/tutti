import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useKeyboardShortcutsHelp, useKeyboardShortcutsState } from '../hooks/useKeyboardShortcuts';

interface ShortcutItemProps {
  label: string;
  description: string;
}

function ShortcutItem({ label, description }: ShortcutItemProps) {
  const { t } = useTranslation();

  // Parse the label to render kbd elements
  const renderKeys = () => {
    const parts = label.split('+').map((part) => part.trim());

    // Check if it's a sequence (space-separated like "G H")
    if (!label.includes('+') && label.includes(' ')) {
      const sequenceParts = label.split(' ');
      return (
        <span className="shortcut-keys">
          {sequenceParts.map((key, index) => (
            <span key={index}>
              <kbd className="shortcut-key">{key}</kbd>
              {index < sequenceParts.length - 1 && <span className="shortcut-separator"> </span>}
            </span>
          ))}
        </span>
      );
    }

    return (
      <span className="shortcut-keys">
        {parts.map((key, index) => (
          <span key={index}>
            <kbd className="shortcut-key">{key}</kbd>
            {index < parts.length - 1 && <span className="shortcut-separator">+</span>}
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="shortcut-item">
      {renderKeys()}
      <span className="shortcut-description">{t(description)}</span>
    </div>
  );
}

interface ShortcutCategoryProps {
  title: string;
  shortcuts: { label: string; description: string }[];
}

function ShortcutCategory({ title, shortcuts }: ShortcutCategoryProps) {
  const { t } = useTranslation();

  return (
    <div className="shortcut-category">
      <h4 className="shortcut-category-title">{t(title)}</h4>
      <div className="shortcut-list">
        {shortcuts.map((shortcut, index) => (
          <ShortcutItem key={index} label={shortcut.label} description={shortcut.description} />
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsHelp() {
  const { t } = useTranslation();
  const { isHelpOpen, closeHelp } = useKeyboardShortcutsState();
  const groupedShortcuts = useKeyboardShortcutsHelp();

  if (!isHelpOpen) {
    return null;
  }

  const categoryTitles: Record<string, string> = {
    navigation: 'shortcuts.categories.navigation',
    actions: 'shortcuts.categories.actions',
    general: 'shortcuts.categories.general',
  };

  const categoryOrder = ['general', 'actions', 'navigation'];

  return (
    <Modal title={t('shortcuts.title')} onClose={closeHelp} size="medium" className="keyboard-shortcuts-modal">
      <div className="keyboard-shortcuts-help">
        <p className="shortcuts-intro">{t('shortcuts.intro')}</p>

        <div className="shortcuts-grid">
          {categoryOrder.map((category) => {
            const shortcuts = groupedShortcuts[category];
            if (!shortcuts || shortcuts.length === 0) return null;

            return <ShortcutCategory key={category} title={categoryTitles[category]} shortcuts={shortcuts} />;
          })}
        </div>

        <div className="shortcuts-footer">
          <p className="shortcuts-tip">{t('shortcuts.tip')}</p>
        </div>
      </div>

      <style>{`
        .keyboard-shortcuts-modal .modal-body {
          max-height: 70vh;
          overflow-y: auto;
        }

        .keyboard-shortcuts-help {
          padding: 0.5rem 0;
        }

        .shortcuts-intro {
          color: var(--text-light);
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
        }

        .shortcuts-grid {
          display: grid;
          gap: 1.5rem;
        }

        @media (min-width: 640px) {
          .shortcuts-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .shortcut-category {
          background: var(--background);
          border-radius: 0.5rem;
          padding: 1rem;
        }

        .shortcut-category-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-light);
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border);
        }

        .shortcut-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .shortcut-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.375rem 0;
        }

        .shortcut-keys {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          flex-shrink: 0;
        }

        .shortcut-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.5rem;
          height: 1.5rem;
          padding: 0 0.375rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.25rem;
          font-family: inherit;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .shortcut-separator {
          color: var(--text-light);
          font-size: 0.625rem;
          margin: 0 0.125rem;
        }

        .shortcut-description {
          color: var(--text);
          font-size: 0.875rem;
          text-align: right;
        }

        .shortcuts-footer {
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        .shortcuts-tip {
          color: var(--text-light);
          font-size: 0.75rem;
          font-style: italic;
          text-align: center;
        }
      `}</style>
    </Modal>
  );
}

// Floating indicator for pending sequence
export function SequenceIndicator() {
  const { t } = useTranslation();
  const { pendingSequence } = useKeyboardShortcutsState();

  if (!pendingSequence) {
    return null;
  }

  return (
    <div className="sequence-indicator" role="status" aria-live="polite">
      <kbd className="sequence-key">{pendingSequence}</kbd>
      <span className="sequence-text">{t('shortcuts.waitingForKey')}</span>

      <style>{`
        .sequence-indicator {
          position: fixed;
          bottom: 5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(0.5rem);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .sequence-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.75rem;
          height: 1.75rem;
          padding: 0 0.5rem;
          background: var(--primary);
          color: white;
          border-radius: 0.25rem;
          font-family: inherit;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .sequence-text {
          color: var(--text-light);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

export default KeyboardShortcutsHelp;
