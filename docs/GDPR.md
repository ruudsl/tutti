# GDPR Compliance

This document describes how Harmonie handles personal data in compliance with the General Data Protection Regulation (GDPR/AVG).

> This document describes how it is **meant** to work. For what the code
> actually does — measured against the schema and verified against a running
> database — see [PIA.md](PIA.md). Where the two differ, PIA.md says so; the
> data export in particular covers less than the section below describes.

## Table of Contents

1. [Data Collected and Purpose](#data-collected-and-purpose)
2. [Data Retention Policies](#data-retention-policies)
3. [User Data Export (Article 15)](#user-data-export-article-15)
4. [User Data Deletion (Article 17)](#user-data-deletion-article-17)
5. [Data Processing Agreements](#data-processing-agreements)
6. [Cookie Policy](#cookie-policy)
7. [Templates](#templates)

---

## Data Collected and Purpose

### Personal Data Categories

| Category       | Data Fields                       | Purpose                          | Legal Basis          |
| -------------- | --------------------------------- | -------------------------------- | -------------------- |
| Identity       | First name, last name             | Member identification            | Contract performance |
| Contact        | Email address, phone (optional)   | Communication about events       | Contract performance |
| Membership     | Instrument, voice part, orchestra | Organize rehearsals/performances | Contract performance |
| Authentication | Password hash, session tokens     | Account security                 | Contract performance |
| Activity       | Login timestamps, IP addresses    | Security and abuse prevention    | Legitimate interest  |
| Attendance     | Rehearsal attendance records      | Ensemble management              | Legitimate interest  |
| Practice       | Practice session logs             | Progress tracking (optional)     | Consent              |
| Financial      | Ticket purchase history           | Payment processing               | Contract performance |

### Special Categories

Harmonie does not collect special category data (health, religion, political views, etc.) unless explicitly configured by the association.

### Third-Party Data

When using integrations, additional data may be processed:

| Integration           | Data Received                         | Purpose                       |
| --------------------- | ------------------------------------- | ----------------------------- |
| Microsoft Entra       | Name, email, job title, profile photo | User provisioning             |
| Google/Facebook OAuth | Name, email                           | Guest checkout authentication |
| WhatsApp/Telegram     | Phone number/Chat ID                  | Notification delivery         |
| Spond                 | Name, email, attendance responses     | Calendar sync                 |

---

## Data Retention Policies

### Default Retention Periods

| Data Type             | Retention Period             | Auto-Delete  |
| --------------------- | ---------------------------- | ------------ |
| Active member data    | Duration of membership       | No           |
| Inactive member data  | 2 years after membership end | Configurable |
| Session data          | 90 days                      | Yes          |
| Login audit logs      | 1 year                       | Yes          |
| Attendance records    | 1 year                       | Configurable |
| Practice logs         | 1 year                       | Configurable |
| Password reset tokens | 24 hours                     | Yes          |
| Recent views          | 30 days                      | Yes          |
| Audio recordings      | Configurable                 | Configurable |
| Deleted user records  | Configurable                 | Configurable |

### Automated Cleanup

Harmonie includes an automated GDPR cleanup scheduler that runs daily (default: 3:00 AM).

**Configuration:**

```env
# Hour to run cleanup (0-23, default: 3)
GDPR_CLEANUP_HOUR=3
```

**Per-Association Settings:**

Associations can configure retention periods in Admin > Settings > Privacy:

```sql
-- Example: Set 180-day retention for practice logs with auto-delete
INSERT INTO data_retention_settings (id, association_id, data_type, retention_days, auto_delete)
VALUES (uuid(), 'assoc-id', 'practice_logs', 180, 1);
```

**Supported data types for auto-cleanup:**

- `sessions` - User login sessions
- `activity_log` - User activity records
- `audit_logs` - Administrative audit trail
- `practice_logs` - Practice session data
- `audio_recordings` - Recorded audio files
- `deleted_users` - Soft-deleted user records
- `password_reset_tokens` - Password reset requests
- `recent_views` - Recently viewed items

### Cleanup Logging

All cleanup operations are logged:

```sql
-- View cleanup history
SELECT * FROM gdpr_cleanup_log ORDER BY run_at DESC LIMIT 10;
```

---

## User Data Export (Article 15)

### Right of Access

Users have the right to obtain a copy of their personal data (GDPR Article 15).

### How Users Export Data

1. Log in to Harmonie
2. Go to **Profile > Privacy Settings**
3. Click **"Export My Data"**
4. Download the generated ZIP file

### Export Format

Data is exported as a ZIP archive containing JSON files:

```
export/
  user-profile.json      # Basic profile information
  attendance.json        # Rehearsal attendance records
  practice-logs.json     # Practice session data
  notifications.json     # Notification preferences
  activity-log.json      # Recent activity
  ticket-purchases.json  # Ticket purchase history
  instruments.json       # Assigned instruments
  orchestras.json        # Orchestra memberships
```

### Technical Implementation

Export endpoint: `POST /api/users/:id/export`

Required role: User can only export their own data; Admins can export any user's data.

Response: Streamed ZIP file download

---

## User Data Deletion (Article 17)

### Right to Erasure

Users have the right to request deletion of their personal data (GDPR Article 17).

### How Users Request Deletion

1. Log in to Harmonie
2. Go to **Profile > Privacy Settings**
3. Click **"Delete My Account"**
4. Confirm deletion

### What Gets Deleted

**Immediately deleted:**

- Personal profile data (name, email, phone)
- Password hash
- Profile photo
- Notification channel links (WhatsApp, Telegram)
- Calendar settings
- Notification preferences

**Anonymized (retained for statistics):**

- Attendance records (user reference replaced with anonymous ID)
- Practice logs (anonymized)

**Retained (legitimate interest / legal requirement):**

- Audit logs (for 1 year) - required for security
- Financial transactions (for 7 years) - legal requirement
- Ticket purchases (anonymized after retention period)

### Soft Delete vs. Hard Delete

Harmonie uses soft delete by default:

1. User data is marked as `status = 'deleted'`
2. Personal data is overwritten with placeholders
3. User can no longer log in
4. After configurable retention period, record is hard deleted

### Admin-Initiated Deletion

Admins can delete users via Admin > Members > [User] > Delete.

Options:

- **Soft delete**: Mark as deleted, retain for audit
- **Hard delete**: Immediately remove all data (except legally required records)

### API Endpoint

```
DELETE /api/users/:id
```

Query parameters:

- `hard=true` - Perform hard delete (admin only)
- `reason=...` - Deletion reason (logged for audit)

---

## Data Processing Agreements

### When DPAs Are Required

A Data Processing Agreement (DPA/Verwerkersovereenkomst) is required when:

1. **Hosting Harmonie for others**: If you host Harmonie as a SaaS service for multiple associations
2. **Using cloud providers**: With your hosting provider, database provider, etc.
3. **Using integrations**: Some integrations (like Mollie, Stripe) require DPAs

### Template

A DPA template is available at:

- `/docs/templates/DATA_PROCESSING_AGREEMENT.md`

This template includes:

- Standard contractual clauses
- Technical and organizational measures
- Sub-processor list
- Data categories and retention periods

### Integration-Specific DPAs

| Provider          | DPA Available                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mollie            | [Mollie DPA](https://www.mollie.com/legal/dpa)                                                                              |
| Stripe            | [Stripe DPA](https://stripe.com/legal/dpa)                                                                                  |
| Microsoft (Entra) | [Microsoft DPA](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA) |
| Google            | [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)                                                 |
| Sentry            | [Sentry DPA](https://sentry.io/legal/dpa/)                                                                                  |
| Twilio            | [Twilio DPA](https://www.twilio.com/legal/data-protection-addendum)                                                         |

---

## Cookie Policy

### Cookies Used

Harmonie uses only **strictly necessary cookies**. No tracking or analytics cookies are used.

| Cookie Name  | Purpose                    | Duration         | Type      |
| ------------ | -------------------------- | ---------------- | --------- |
| `session_id` | User authentication        | Session / 7 days | Essential |
| `csrf_token` | CSRF protection            | Session          | Essential |
| `lang`       | Language preference        | 1 year           | Essential |
| `theme`      | Light/dark mode preference | 1 year           | Essential |

### No Third-Party Tracking

Harmonie does not use:

- Google Analytics
- Facebook Pixel
- Any advertising cookies
- Any cross-site tracking

### Cookie Consent

Because only essential cookies are used, explicit cookie consent banners are generally not required under GDPR. However, associations may choose to display a cookie notice for transparency.

### Local Storage

The following data is stored in browser local storage:

| Key                | Purpose                  | Contains PII         |
| ------------------ | ------------------------ | -------------------- |
| `auth_token`       | JWT authentication token | User ID              |
| `user_preferences` | UI preferences           | No                   |
| `recent_searches`  | Recent search queries    | No                   |
| `offline_cache`    | PWA offline data         | Yes (cached content) |

---

## Templates

### Privacy Policy Template

Available at: `/docs/templates/PRIVACY_POLICY.md`

This template is designed for associations using Harmonie and includes:

- Contact details placeholder
- Data categories collected
- Processing purposes and legal basis
- Retention periods
- User rights explanation
- Cookie information

**Usage:**

1. Copy the template
2. Fill in placeholders (marked with `[brackets]`)
3. Review and adjust for your specific use case
4. Have it reviewed by a legal advisor
5. Publish on your website

### Data Processing Agreement Template

Available at: `/docs/templates/DATA_PROCESSING_AGREEMENT.md`

Use this template when:

- You host Harmonie for other associations
- You operate Harmonie as a SaaS service

Includes:

- Party definitions
- Processing purposes
- Security measures
- Sub-processor handling
- Audit rights
- Data breach procedures

---

## Technical Implementation

### Data Anonymization

When anonymizing data, Harmonie:

1. Replaces personal identifiers with hashed values
2. Removes or masks email addresses
3. Replaces names with "Deleted User"
4. Clears phone numbers
5. Removes profile photos
6. Clears social login identifiers

Example anonymization:

```sql
UPDATE users SET
  email = 'deleted-' || id || '@deleted.invalid',
  first_name = 'Deleted',
  last_name = 'User',
  phone = NULL,
  profile_photo_path = NULL,
  microsoft_id = NULL,
  status = 'deleted'
WHERE id = ?;
```

### Audit Trail

All data access and modifications are logged:

```sql
-- Audit log structure
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,           -- Who performed the action
  action TEXT,            -- create, update, delete, export
  entity_type TEXT,       -- users, music_pieces, etc.
  entity_id TEXT,
  description TEXT,
  old_values TEXT,        -- JSON of previous values
  new_values TEXT,        -- JSON of new values
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME
);
```

### Encryption

Sensitive data is encrypted:

| Data              | Encryption Method       |
| ----------------- | ----------------------- |
| Passwords         | bcrypt (cost factor 10) |
| OAuth tokens      | AES-256-GCM             |
| Spond credentials | AES-256-GCM             |
| Session tokens    | JWT with HS256          |

---

## Compliance Checklist

### For Association Administrators

- [ ] Complete and publish Privacy Policy (use template)
- [ ] Configure data retention periods appropriately
- [ ] Review and sign DPAs with third-party providers
- [ ] Train staff on data protection procedures
- [ ] Document data processing activities
- [ ] Establish procedure for data subject requests
- [ ] Configure appropriate access controls (roles)

### For Self-Hosters

- [ ] Implement HTTPS/TLS
- [ ] Configure secure database backups (encrypted)
- [ ] Set up access logging
- [ ] Sign DPA with hosting provider
- [ ] Document technical measures
- [ ] Configure automated data cleanup
- [ ] Test data export and deletion procedures

### For SaaS Operators

- [ ] Provide DPA to all customer associations
- [ ] Implement multi-tenant data isolation
- [ ] Document sub-processors
- [ ] Establish data breach notification procedure
- [ ] Provide data portability options
- [ ] Regular security audits
- [ ] Privacy impact assessments for new features

---

## Contact

For questions about GDPR compliance in Harmonie:

1. Check this documentation
2. Review the template documents in `/docs/templates/`
3. Open an issue on GitHub for technical questions
4. Consult a legal professional for specific compliance questions

---

## References

- [GDPR Full Text](https://gdpr-info.eu/)
- [Dutch DPA (Autoriteit Persoonsgegevens)](https://autoriteitpersoonsgegevens.nl/)
- [Template Privacy Policy](/docs/templates/PRIVACY_POLICY.md)
- [Template DPA](/docs/templates/DATA_PROCESSING_AGREEMENT.md)
