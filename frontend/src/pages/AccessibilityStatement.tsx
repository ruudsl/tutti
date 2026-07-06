import { currentLocale } from '../utils/locale';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export default function AccessibilityStatement() {
  const { t } = useTranslation();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('accessibility.statementTitle', 'Toegankelijkheidsverklaring')}</h1>
      </div>

      <div className="card" style={{ maxWidth: '800px' }}>
        <div className="card-body" style={{ lineHeight: '1.7' }}>
          <section aria-labelledby="commitment-heading">
            <h2 id="commitment-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.commitment', 'Onze toewijding aan toegankelijkheid')}
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              {t(
                'accessibility.commitmentText',
                'Tutti streeft ernaar een toegankelijke applicatie te bieden voor alle gebruikers, ongeacht hun mogelijkheden. We volgen de Web Content Accessibility Guidelines (WCAG) 2.1 op niveau AA om een inclusieve ervaring te garanderen.',
              )}
            </p>
          </section>

          <section aria-labelledby="standards-heading" style={{ marginTop: '2rem' }}>
            <h2 id="standards-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.standards', 'Toegankelijkheidsstandaarden')}
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              {t('accessibility.standardsText', 'Deze applicatie is ontworpen volgens WCAG 2.1 niveau AA. Dit omvat:')}
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>{t('accessibility.perceivable', 'Waarneembaar')}</strong>
                {' - '}
                {t(
                  'accessibility.perceivableText',
                  'Tekstalternatieven voor afbeeldingen, voldoende kleurcontrast (minimaal 4.5:1), en ondersteuning voor tekst vergroting.',
                )}
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>{t('accessibility.operable', 'Bedienbaar')}</strong>
                {' - '}
                {t(
                  'accessibility.operableText',
                  'Volledige toetsenbordnavigatie, zichtbare focusindicatoren, en skip links om direct naar de hoofdinhoud te gaan.',
                )}
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>{t('accessibility.understandable', 'Begrijpelijk')}</strong>
                {' - '}
                {t(
                  'accessibility.understandableText',
                  'Duidelijke labels voor formuliervelden, foutmeldingen, en consistente navigatie.',
                )}
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>{t('accessibility.robust', 'Robuust')}</strong>
                {' - '}
                {t(
                  'accessibility.robustText',
                  'Compatibiliteit met hulptechnologieën zoals schermlezers (NVDA, VoiceOver, JAWS).',
                )}
              </li>
            </ul>
          </section>

          <section aria-labelledby="features-heading" style={{ marginTop: '2rem' }}>
            <h2 id="features-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.features', 'Toegankelijkheidsfuncties')}
            </h2>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.skipLink', 'Skip-link om direct naar de hoofdinhoud te navigeren')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.keyboardNav', 'Volledige toetsenbordnavigatie (Tab, Enter, Escape, pijltjestoetsen)')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.focusIndicators', 'Duidelijke focusindicatoren voor interactieve elementen')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.ariaLabels', 'ARIA-labels en landmarks voor schermlezers')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.colorContrast', 'Kleurcontrast van minimaal 4.5:1 voor normale tekst')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.darkMode', 'Donkere modus voor verminderde oogbelasting')}
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ color: 'var(--success)', flexShrink: 0 }}>
                  <Icon name="check" size={16} />
                </span>
                {t('accessibility.responsiveDesign', 'Responsief ontwerp voor alle schermformaten')}
              </li>
            </ul>
          </section>

          <section aria-labelledby="shortcuts-heading" style={{ marginTop: '2rem' }}>
            <h2 id="shortcuts-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.shortcuts', 'Sneltoetsen')}
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              {t('accessibility.shortcutsText', 'De volgende sneltoetsen zijn beschikbaar:')}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid var(--border)' }}
                  >
                    {t('accessibility.shortcut', 'Sneltoets')}
                  </th>
                  <th
                    scope="col"
                    style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid var(--border)' }}
                  >
                    {t('accessibility.action', 'Actie')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <kbd
                      style={{
                        background: 'var(--surface-hover)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Cmd/Ctrl + K
                    </kbd>
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {t('accessibility.searchShortcut', 'Zoekfunctie openen')}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <kbd
                      style={{
                        background: 'var(--surface-hover)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      ?
                    </kbd>
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {t('accessibility.helpShortcut', 'Sneltoetsen weergeven')}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <kbd
                      style={{
                        background: 'var(--surface-hover)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Escape
                    </kbd>
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {t('accessibility.escapeShortcut', 'Dialoog of menu sluiten')}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section aria-labelledby="feedback-heading" style={{ marginTop: '2rem' }}>
            <h2 id="feedback-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.feedback', 'Feedback')}
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              {t(
                'accessibility.feedbackText',
                'We werken voortdurend aan het verbeteren van de toegankelijkheid van Tutti. Als je problemen ondervindt of suggesties hebt, neem dan contact met ons op:',
              )}
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem', listStyle: 'none' }}>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="paperclip" size={16} />
                <a href="mailto:accessibility@tutti.app">accessibility@tutti.app</a>
              </li>
              <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="link" size={16} />
                <a href="https://github.com/ruudsl/tutti/issues" target="_blank" rel="noopener noreferrer">
                  GitHub Issues
                </a>
              </li>
            </ul>
          </section>

          <section aria-labelledby="testing-heading" style={{ marginTop: '2rem' }}>
            <h2 id="testing-heading" style={{ marginBottom: '1rem' }}>
              {t('accessibility.testing', 'Testen')}
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              {t('accessibility.testingText', 'Deze applicatie is getest met de volgende tools en hulptechnologieën:')}
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>axe DevTools (geautomatiseerde toegankelijkheidstests)</li>
              <li>NVDA (schermlezer voor Windows)</li>
              <li>VoiceOver (schermlezer voor macOS/iOS)</li>
              <li>Toetsenbordnavigatie</li>
              <li>Chrome Lighthouse</li>
            </ul>
          </section>

          <section
            aria-labelledby="date-heading"
            style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}
          >
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {t('accessibility.lastUpdated', 'Laatst bijgewerkt')}:{' '}
              {new Date().toLocaleDateString(currentLocale(), { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </section>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <Link to="/" className="btn btn-outline">
          <Icon name="home" size={16} /> {t('common.backToHome', 'Terug naar home')}
        </Link>
      </div>
    </div>
  );
}
