import { useTranslation } from 'react-i18next';

export interface AccessibilityInfoProps {
  wheelchairSpaces: number;
  companionSpaces: number;
  hearingLoopAvailable: boolean;
  accessibleParkingInfo?: string;
  additionalInfo?: string;
  contactEmail?: string;
  contactPhone?: string;
  variant?: 'full' | 'compact';
}

/**
 * AccessibilityInfo component - displays accessibility information for concerts/venues
 *
 * WCAG 2.1 AA compliance:
 * - Uses semantic HTML with proper heading structure
 * - All icons have accessible text alternatives via aria-label or visually hidden text
 * - Proper color contrast (icons use currentColor, inheriting text color)
 * - Fully keyboard accessible (all interactive elements are focusable)
 * - Screen reader friendly with proper ARIA attributes
 */
export default function AccessibilityInfo({
  wheelchairSpaces,
  companionSpaces,
  hearingLoopAvailable,
  accessibleParkingInfo,
  additionalInfo,
  contactEmail,
  contactPhone,
  variant = 'full',
}: AccessibilityInfoProps) {
  const { t } = useTranslation();

  const hasAnyInfo = wheelchairSpaces > 0 ||
    companionSpaces > 0 ||
    hearingLoopAvailable ||
    accessibleParkingInfo ||
    additionalInfo;

  if (!hasAnyInfo && variant === 'compact') {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div
        className="accessibility-info-compact"
        role="group"
        aria-label={t('accessibilityInfo.title')}
      >
        {wheelchairSpaces > 0 && (
          <span
            className="accessibility-badge"
            title={t('accessibilityInfo.wheelchairSpacesCount', { count: wheelchairSpaces })}
            aria-label={t('accessibilityInfo.wheelchairSpacesCount', { count: wheelchairSpaces })}
          >
            <WheelchairIcon aria-hidden="true" />
            <span className="visually-hidden">
              {t('accessibilityInfo.wheelchairSpacesCount', { count: wheelchairSpaces })}
            </span>
          </span>
        )}
        {companionSpaces > 0 && (
          <span
            className="accessibility-badge"
            title={t('accessibilityInfo.companionSpacesCount', { count: companionSpaces })}
            aria-label={t('accessibilityInfo.companionSpacesCount', { count: companionSpaces })}
          >
            <CompanionIcon aria-hidden="true" />
            <span className="visually-hidden">
              {t('accessibilityInfo.companionSpacesCount', { count: companionSpaces })}
            </span>
          </span>
        )}
        {hearingLoopAvailable && (
          <span
            className="accessibility-badge"
            title={t('accessibilityInfo.hearingLoopAvailable')}
            aria-label={t('accessibilityInfo.hearingLoopAvailable')}
          >
            <HearingLoopIcon aria-hidden="true" />
            <span className="visually-hidden">
              {t('accessibilityInfo.hearingLoopAvailable')}
            </span>
          </span>
        )}
        {accessibleParkingInfo && (
          <span
            className="accessibility-badge"
            title={t('accessibilityInfo.accessibleParking')}
            aria-label={t('accessibilityInfo.accessibleParking')}
          >
            <ParkingIcon aria-hidden="true" />
            <span className="visually-hidden">
              {t('accessibilityInfo.accessibleParking')}
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <section
      className="accessibility-info card"
      aria-labelledby="accessibility-heading"
    >
      <div className="card-body">
        <h3 id="accessibility-heading" className="accessibility-info-title">
          <AccessibilityIcon aria-hidden="true" />
          {t('accessibilityInfo.title')}
        </h3>

        <dl className="accessibility-info-list">
          {wheelchairSpaces > 0 && (
            <div className="accessibility-info-item">
              <dt>
                <WheelchairIcon aria-hidden="true" />
                {t('accessibilityInfo.wheelchairSpaces')}
              </dt>
              <dd>{t('accessibilityInfo.wheelchairSpacesCount', { count: wheelchairSpaces })}</dd>
            </div>
          )}

          {companionSpaces > 0 && (
            <div className="accessibility-info-item">
              <dt>
                <CompanionIcon aria-hidden="true" />
                {t('accessibilityInfo.companionSpaces')}
              </dt>
              <dd>{t('accessibilityInfo.companionSpacesCount', { count: companionSpaces })}</dd>
            </div>
          )}

          {hearingLoopAvailable && (
            <div className="accessibility-info-item">
              <dt>
                <HearingLoopIcon aria-hidden="true" />
                {t('accessibilityInfo.hearingLoop')}
              </dt>
              <dd>{t('accessibilityInfo.hearingLoopAvailable')}</dd>
            </div>
          )}

          {accessibleParkingInfo && (
            <div className="accessibility-info-item">
              <dt>
                <ParkingIcon aria-hidden="true" />
                {t('accessibilityInfo.accessibleParking')}
              </dt>
              <dd>{accessibleParkingInfo}</dd>
            </div>
          )}

          {additionalInfo && (
            <div className="accessibility-info-item accessibility-info-item-full">
              <dt>
                <InfoIcon aria-hidden="true" />
                {t('accessibilityInfo.additionalInfo')}
              </dt>
              <dd>{additionalInfo}</dd>
            </div>
          )}
        </dl>

        {(contactEmail || contactPhone) && (
          <div className="accessibility-contact">
            <h4 className="accessibility-contact-title">
              {t('accessibilityInfo.contactTitle')}
            </h4>
            <p className="accessibility-contact-description">
              {t('accessibilityInfo.contactDescription')}
            </p>
            <div className="accessibility-contact-methods">
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(t('accessibilityInfo.emailSubject'))}`}
                  className="btn btn-outline"
                  aria-label={t('accessibilityInfo.emailContact', { email: contactEmail })}
                >
                  <EmailIcon aria-hidden="true" />
                  {contactEmail}
                </a>
              )}
              {contactPhone && (
                <a
                  href={`tel:${contactPhone.replace(/\s/g, '')}`}
                  className="btn btn-outline"
                  aria-label={t('accessibilityInfo.phoneContact', { phone: contactPhone })}
                >
                  <PhoneIcon aria-hidden="true" />
                  {contactPhone}
                </a>
              )}
            </div>
          </div>
        )}

        {!hasAnyInfo && (
          <p className="accessibility-info-none">
            {t('accessibilityInfo.noInfoAvailable')}
          </p>
        )}
      </div>
    </section>
  );
}

// Icon components using SVG for better accessibility and scalability
// All icons follow WCAG guidelines with proper sizing and color contrast

function AccessibilityIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v6m0 0-4 4m4-4 4 4" />
      <path d="M6 10h12" />
    </svg>
  );
}

function WheelchairIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <circle cx="10" cy="18" r="4" />
      <circle cx="10" cy="4" r="2" />
      <path d="M10 6v6h5l2 6" />
      <path d="M10 12H6" />
    </svg>
  );
}

function CompanionIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HearingLoopIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
      <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ParkingIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </svg>
  );
}

function InfoIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function EmailIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="accessibility-icon"
      focusable="false"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// Named export for compact icon indicator used in lists
export function AccessibilityIndicator({ hasAccessibilityInfo }: { hasAccessibilityInfo: boolean }) {
  const { t } = useTranslation();

  if (!hasAccessibilityInfo) {
    return null;
  }

  return (
    <span
      className="accessibility-indicator"
      title={t('accessibilityInfo.available')}
      aria-label={t('accessibilityInfo.available')}
    >
      <AccessibilityIcon aria-hidden="true" />
    </span>
  );
}
