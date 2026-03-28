import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useRecentItems,
  formatRelativeTime,
  ItemCategory,
  categoryTranslationKeys,
  itemTypeTranslationKeys,
  RecentItem,
} from '../hooks/useRecentItems';

interface RecentItemsProps {
  limit?: number;
}

export function RecentItems({ limit = 10 }: RecentItemsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { items, groupedItems, isLoading, error } = useRecentItems(selectedCategory, limit);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const categories: ItemCategory[] = ['all', 'music', 'lists', 'rehearsals'];

  const renderIcon = (item: RecentItem) => (
    <svg
      className="recent-item-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={item.icon} />
    </svg>
  );

  const hasItems = items.length > 0;

  return (
    <div className="recent-items-container">
      <button
        ref={buttonRef}
        type="button"
        className="recent-items-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('recentItems.title')}
        title={t('recentItems.title')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="recent-items-icon"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="recent-items-dropdown"
          role="menu"
          aria-label={t('recentItems.title')}
        >
          <div className="recent-items-header">
            <h3 className="recent-items-title">{t('recentItems.title')}</h3>
          </div>

          <div className="recent-items-tabs" role="tablist">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`recent-items-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {t(categoryTranslationKeys[category])}
                {category !== 'all' && groupedItems[category].length > 0 && (
                  <span className="recent-items-count">
                    {groupedItems[category].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="recent-items-content" role="tabpanel">
            {isLoading ? (
              <div className="recent-items-loading">
                <span className="recent-items-spinner" aria-hidden="true" />
                {t('common.loading')}
              </div>
            ) : error ? (
              <div className="recent-items-error">
                {t('recentItems.error')}
              </div>
            ) : !hasItems ? (
              <div className="recent-items-empty">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="recent-items-empty-icon"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <p>{t('recentItems.empty')}</p>
              </div>
            ) : (
              <ul className="recent-items-list">
                {items.map((item) => (
                  <li key={item.id} className="recent-item">
                    <Link
                      to={item.path}
                      className="recent-item-link"
                      onClick={() => setIsOpen(false)}
                      role="menuitem"
                    >
                      <span className="recent-item-icon-wrapper">
                        {renderIcon(item)}
                      </span>
                      <span className="recent-item-content">
                        <span className="recent-item-title">{item.title}</span>
                        <span className="recent-item-meta">
                          <span className="recent-item-type">
                            {t(itemTypeTranslationKeys[item.type])}
                          </span>
                          <span className="recent-item-separator">-</span>
                          <span className="recent-item-time">
                            {formatRelativeTime(item.viewedAt, t)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <style>{`
        .recent-items-container {
          position: relative;
        }

        .recent-items-trigger {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 0.375rem;
          color: var(--text-light);
          cursor: pointer;
          transition: color 0.15s, background-color 0.15s;
        }

        .recent-items-trigger:hover {
          color: var(--text);
          background-color: var(--background);
        }

        .recent-items-trigger:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .recent-items-icon {
          width: 1.25rem;
          height: 1.25rem;
        }

        .recent-items-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          width: 22rem;
          max-height: 32rem;
          margin-top: 0.5rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          z-index: 1000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .recent-items-header {
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .recent-items-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
        }

        .recent-items-tabs {
          display: flex;
          padding: 0.5rem;
          gap: 0.25rem;
          border-bottom: 1px solid var(--border);
          overflow-x: auto;
        }

        .recent-items-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: transparent;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-light);
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.15s, color 0.15s;
        }

        .recent-items-tab:hover {
          background-color: var(--background);
          color: var(--text);
        }

        .recent-items-tab.active {
          background-color: var(--primary);
          color: white;
        }

        .recent-items-tab:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .recent-items-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.25rem;
          height: 1.25rem;
          padding: 0 0.375rem;
          background: var(--background);
          border-radius: 9999px;
          font-size: 0.6875rem;
          font-weight: 600;
        }

        .recent-items-tab.active .recent-items-count {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .recent-items-content {
          flex: 1;
          overflow-y: auto;
          min-height: 8rem;
        }

        .recent-items-loading,
        .recent-items-error,
        .recent-items-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem 1rem;
          color: var(--text-light);
          text-align: center;
        }

        .recent-items-spinner {
          width: 1.5rem;
          height: 1.5rem;
          border: 2px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .recent-items-empty-icon {
          width: 3rem;
          height: 3rem;
          color: var(--text-light);
          opacity: 0.5;
        }

        .recent-items-list {
          list-style: none;
          padding: 0.5rem;
          margin: 0;
        }

        .recent-item {
          margin-bottom: 0.125rem;
        }

        .recent-item:last-child {
          margin-bottom: 0;
        }

        .recent-item-link {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          color: var(--text);
          text-decoration: none;
          border-radius: 0.5rem;
          transition: background-color 0.15s;
        }

        .recent-item-link:hover {
          background-color: var(--background);
        }

        .recent-item-link:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
        }

        .recent-item-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          background: var(--background);
          border-radius: 0.375rem;
          flex-shrink: 0;
        }

        .recent-item-icon {
          width: 1rem;
          height: 1rem;
          color: var(--primary);
        }

        .recent-item-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .recent-item-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .recent-item-meta {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
          color: var(--text-light);
        }

        .recent-item-separator {
          opacity: 0.5;
        }

        @media (max-width: 640px) {
          .recent-items-dropdown {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            max-height: 70vh;
            margin-top: 0;
            border-radius: 1rem 1rem 0 0;
          }
        }
      `}</style>
    </div>
  );
}

export default RecentItems;
