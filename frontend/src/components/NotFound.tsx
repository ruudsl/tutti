import { Link } from 'react-router-dom';
import { ROUTES } from '../utils/constants';

interface NotFoundProps {
  title?: string;
  message?: string;
}

/**
 * 404 Not Found page component
 */
export function NotFound({
  title = 'Pagina niet gevonden',
  message = 'De pagina die je zoekt bestaat niet of is verplaatst.',
}: NotFoundProps) {
  return (
    <div className="not-found">
      <div className="not-found-content">
        <div className="not-found-icon">🔍</div>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="not-found-actions">
          <Link to={ROUTES.DASHBOARD} className="btn btn-primary">
            Naar Dashboard
          </Link>
          <button
            className="btn btn-outline"
            onClick={() => window.history.back()}
          >
            Ga terug
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
