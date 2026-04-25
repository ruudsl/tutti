import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '../utils/constants';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from '../components/Icon';

/**
 * 404 Not Found page component
 */
export function NotFound() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.notFound');

  return (
    <div className="not-found" role="main">
      <div className="not-found-content">
        <div className="not-found-icon" aria-hidden="true"><Icon name="search" size={48} /></div>
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.description')}</p>
        <div className="not-found-actions">
          <Link to={ROUTES.DASHBOARD} className="btn btn-primary">
            {t('notFound.backToDashboard')}
          </Link>
          <button
            className="btn btn-outline"
            onClick={() => window.history.back()}
            type="button"
          >
            {t('notFound.goBack')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
