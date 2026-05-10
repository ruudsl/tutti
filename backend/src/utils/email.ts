import nodemailer from 'nodemailer';
import logger from './logger';
import db from '../database/connection';

const sanitizeForLog = (value: unknown): string => {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim();
};

interface SmtpConfig {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
  smtp_enabled: number | null;
}

/**
 * Get SMTP config from the database (first association with SMTP enabled),
 * falling back to environment variables.
 */
const getSmtpTransporter = (associationId?: string | null): nodemailer.Transporter | null => {
  // Try database config first
  try {
    let smtpConfig: SmtpConfig | undefined;

    if (associationId) {
      smtpConfig = db.prepare(
        'SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, smtp_enabled FROM associations WHERE id = ? AND smtp_enabled = 1 AND smtp_host IS NOT NULL'
      ).get(associationId) as SmtpConfig | undefined;
    }

    // Fallback: try any association with SMTP enabled
    if (!smtpConfig) {
      smtpConfig = db.prepare(
        'SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, smtp_enabled FROM associations WHERE smtp_enabled = 1 AND smtp_host IS NOT NULL LIMIT 1'
      ).get() as SmtpConfig | undefined;
    }

    if (smtpConfig?.smtp_host) {
      return nodemailer.createTransport({
        host: smtpConfig.smtp_host,
        port: smtpConfig.smtp_port || 587,
        secure: !!smtpConfig.smtp_secure,
        auth: smtpConfig.smtp_user ? {
          user: smtpConfig.smtp_user,
          pass: smtpConfig.smtp_pass || '',
        } : undefined,
      });
    }
  } catch {
    // Database might not be initialized yet, fall through to env vars
  }

  // Fallback to environment variables
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return null;
};

/**
 * Get the "from" address from database config or environment.
 */
const getFromAddress = (associationId?: string | null): string => {
  try {
    let smtpConfig: SmtpConfig | undefined;

    if (associationId) {
      smtpConfig = db.prepare(
        'SELECT smtp_from FROM associations WHERE id = ? AND smtp_enabled = 1 AND smtp_host IS NOT NULL'
      ).get(associationId) as SmtpConfig | undefined;
    }

    if (!smtpConfig) {
      smtpConfig = db.prepare(
        'SELECT smtp_from FROM associations WHERE smtp_enabled = 1 AND smtp_host IS NOT NULL LIMIT 1'
      ).get() as SmtpConfig | undefined;
    }

    if (smtpConfig?.smtp_from) {
      return smtpConfig.smtp_from;
    }
  } catch {
    // Fall through
  }

  return process.env.SMTP_FROM || '"Harmonie App" <noreply@harmonie.app>';
};

interface EmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  associationId?: string | null;
  attachments?: EmailAttachment[];
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const { to, subject, text, html, associationId, attachments } = options;
  const safeTo = sanitizeForLog(to);
  const safeSubject = sanitizeForLog(subject);
  const safeText = sanitizeForLog(text);
  const safeAttachmentNames = attachments?.map(a => sanitizeForLog(a.filename)).join(', ');

  // Log email for development/debugging
  logger.info(`Sending email to ${sanitizeForLog(to)}: ${sanitizeForLog(subject)}${attachments?.length ? ` (${attachments.length} attachments)` : ''}`);

  const transporter = getSmtpTransporter(associationId);

  if (!transporter) {
    // Log the email content when no SMTP is configured
    logger.warn('No SMTP configuration found. Emails will be logged to console only.');
    logger.info('Email content (no SMTP configured):');
    logger.info(`To: ${safeTo}`);
    logger.info(`Subject: ${safeSubject}`);
    logger.info(`Body: ${safeText}`);
    if (attachments?.length) {
      logger.info(`Attachments: ${safeAttachmentNames}`);
    }
    return true; // Pretend it was sent successfully
  }

  try {
    const from = getFromAddress(associationId);
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text,
      attachments: attachments?.map(a => ({
        filename: a.filename,
        path: a.path,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    logger.info(`Email sent successfully: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  userName: string,
  associationId?: string | null
): Promise<boolean> => {
  // Get the frontend URL from environment or use default
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  const subject = 'Wachtwoord herstellen - Harmonie App';

  const text = `
Hallo ${userName},

Je hebt een verzoek ingediend om je wachtwoord te herstellen voor de Harmonie App.

Klik op de volgende link om een nieuw wachtwoord in te stellen:
${resetUrl}

Deze link is 1 uur geldig.

Als je geen wachtwoord reset hebt aangevraagd, kun je deze email negeren.

Met vriendelijke groet,
Het Harmonie Team
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Wachtwoord herstellen</h2>
    <p>Hallo ${userName},</p>
    <p>Je hebt een verzoek ingediend om je wachtwoord te herstellen voor de Harmonie App.</p>
    <p>Klik op de onderstaande knop om een nieuw wachtwoord in te stellen:</p>
    <a href="${resetUrl}" class="button">Wachtwoord herstellen</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${resetUrl}">${resetUrl}</a></p>
    <p><strong>Deze link is 1 uur geldig.</strong></p>
    <div class="footer">
      <p>Als je geen wachtwoord reset hebt aangevraagd, kun je deze email negeren.</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html, associationId });
};
