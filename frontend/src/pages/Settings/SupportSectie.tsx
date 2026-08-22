import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';

/** Eén verwijzing in de supportsectie. */
const VERWIJZINGEN = [
  {
    naar: '/issues',
    icoon: 'pencil',
    titel: ['settings.support.reportIssue', 'Report Issue'],
    uitleg: ['settings.support.reportIssueDesc', 'Report problems with sheet music'],
  },
  {
    naar: '/user-guide',
    icoon: 'info',
    titel: ['settings.support.userGuide', 'User Guide'],
    uitleg: ['settings.support.userGuideDesc', 'Learn how to use the app'],
  },
  {
    naar: '/accessibility',
    icoon: 'eye',
    titel: ['settings.support.accessibility', 'Accessibility'],
    uitleg: ['settings.support.accessibilityDesc', 'Accessibility information'],
  },
] as const;

/**
 * Drie verwijzingen naar hulp: meldingen, handleiding en toegankelijkheid.
 *
 * Geen toestand, geen aanroepen - alleen opmaak. Stond eerst als achtenvijftig
 * regels driemaal herhaalde kaart onderaan de pagina; nu één keer beschreven met
 * een lijstje ernaast, zodat een vierde verwijzing één regel is.
 */
export function SupportSectie() {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('settings.support.title', 'Support & Help')}</h2>
      </div>
      <div className="card-body">
        <p className="piece-meta mb-3">
          {t('settings.support.description', 'Access help resources and report issues.')}
        </p>

        <div className="grid grid-3" style={{ gap: '1rem' }}>
          {VERWIJZINGEN.map((verwijzing) => (
            <Link
              key={verwijzing.naar}
              to={verwijzing.naar}
              className="card"
              style={{ textDecoration: 'none', border: '1px solid var(--border-color)' }}
            >
              <div className="card-body" style={{ textAlign: 'center' }}>
                <Icon name={verwijzing.icoon} size={32} />
                <h3 style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                  {t(verwijzing.titel[0], verwijzing.titel[1])}
                </h3>
                <p className="piece-meta">{t(verwijzing.uitleg[0], verwijzing.uitleg[1])}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
