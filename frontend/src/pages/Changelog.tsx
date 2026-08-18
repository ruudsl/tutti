import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { getChangelog } from '../api';

export default function Changelog() {
  const { t, i18n } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['changelog', i18n.language],
    queryFn: () => getChangelog(i18n.language),
  });

  // Simple markdown to HTML conversion for changelog
  const renderMarkdown = (content: string): string => {
    return (
      content
        // Headers
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(
          /^## \[(.+?)\] - (.+)$/gm,
          '<h3 class="changelog-version"><span class="version">$1</span> <span class="date">$2</span></h3>',
        )
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Lists
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        // Wrap consecutive li elements in ul
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Paragraphs (non-empty lines that aren't already wrapped)
        .replace(/^(?!<[hul]|$)(.+)$/gm, '<p>$1</p>')
        // Line breaks
        .replace(/\n\n/g, '\n')
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('changelog.title')}</h1>
        <p className="text-light">{t('changelog.description')}</p>
      </div>

      <div className="card">
        <div className="card-body">
          {isLoading && (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          )}

          {error && <div className="alert alert-danger">{t('errors.generic')}</div>}

          {data && (
            <div
              className="changelog-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(data.content)) }}
            />
          )}
        </div>
      </div>

      <style>{`
        .changelog-content h2 {
          margin-bottom: 1.5rem;
          color: var(--text);
        }
        .changelog-content h3.changelog-version {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border);
        }
        .changelog-content .version {
          background: var(--primary);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 0.25rem;
          font-size: 1rem;
        }
        .changelog-content .date {
          color: var(--text-light);
          font-size: 0.9rem;
          font-weight: normal;
        }
        .changelog-content h4 {
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          color: var(--text);
          font-size: 1rem;
        }
        .changelog-content ul {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .changelog-content li {
          margin: 0.25rem 0;
          color: var(--text);
        }
        .changelog-content p {
          color: var(--text-light);
          margin: 0.5rem 0;
        }
      `}</style>
    </div>
  );
}
