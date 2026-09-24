import nodemailer from 'nodemailer';
import logger from './logger';
import db from '../database/connection';
import { getPasswordResetEmail } from '../templates/emails';

const sanitizeForLog = (value: unknown): string => {
  return (
    String(value ?? '')
      .replace(/[\r\n]+/g, ' ')
      // eslint-disable-next-line no-control-regex -- strip control chars from log output
      .replace(/[\u0000-\u001F\u007F]+/g, ' ')
      .trim()
  );
};

interface SmtpRij {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
}

interface SmtpKeuze {
  transporter: nodemailer.Transporter;
  from: string;
  bron: 'vereniging' | 'installatie';
}

const STANDAARD_AFZENDER = '"Harmonie App" <noreply@harmonie.app>';

/**
 * Via welke SMTP-server en met welke afzender gaat een bericht de deur uit?
 *
 * 1. De eigen SMTP-instellingen van de vereniging, als die aan staan.
 * 2. Anders de installatiebrede `SMTP_*`-omgevingsvariabelen: de server van
 *    wie Tutti draait, niet van een vereniging.
 * 3. Anders niets: dan wordt er niet verstuurd.
 *
 * Nooit de instellingen van een andere vereniging. Hier stond eerst een
 * terugval op "de eerste vereniging met SMTP aan"; daardoor gingen
 * bijvoorbeeld de wachtwoordherstellinks van vereniging B via het
 * mailaccount en met de afzender van vereniging A. Die kan ze dan lezen, en
 * de ontvanger ziet een afzender die niets met zijn vereniging te maken heeft.
 */
const kiesSmtp = (associationId?: string | null): SmtpKeuze | null => {
  if (associationId) {
    let rij: SmtpRij | undefined;
    try {
      rij = db
        .prepare(
          'SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM associations WHERE id = ? AND smtp_enabled = 1 AND smtp_host IS NOT NULL',
        )
        .get(associationId) as SmtpRij | undefined;
    } catch {
      // Database nog niet klaar: dan valt er ook niets van de vereniging te lezen.
    }

    if (rij?.smtp_host) {
      return {
        transporter: nodemailer.createTransport({
          host: rij.smtp_host,
          port: rij.smtp_port || 587,
          secure: !!rij.smtp_secure,
          auth: rij.smtp_user ? { user: rij.smtp_user, pass: rij.smtp_pass || '' } : undefined,
        }),
        from: rij.smtp_from || process.env.SMTP_FROM || STANDAARD_AFZENDER,
        bron: 'vereniging',
      };
    }
  }

  if (process.env.SMTP_HOST) {
    return {
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      }),
      from: process.env.SMTP_FROM || STANDAARD_AFZENDER,
      bron: 'installatie',
    };
  }

  return null;
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
  const safeAttachmentNames = attachments?.map((a) => sanitizeForLog(a.filename)).join(', ');

  // Log email for development/debugging
  logger.info(
    `Sending email to ${sanitizeForLog(to)}: ${sanitizeForLog(subject)}${attachments?.length ? ` (${attachments.length} attachments)` : ''}`,
  );

  const smtp = kiesSmtp(associationId);

  if (!smtp) {
    // Log metadata only when no SMTP is configured (avoid logging user-controlled body content)
    logger.warn(
      associationId
        ? `E-mail niet verstuurd: vereniging ${sanitizeForLog(associationId)} heeft geen eigen SMTP aan staan en de installatie heeft geen SMTP_HOST. De SMTP van een andere vereniging wordt nooit gebruikt.`
        : 'E-mail niet verstuurd: er is geen installatiebrede SMTP ingesteld (SMTP_HOST).',
    );
    logger.info('Email content (no SMTP configured):');
    logger.info(`To: ${safeTo}`);
    logger.info(`Subject: ${safeSubject}`);
    logger.info(`Body length: ${safeText.length} characters`);
    if (attachments?.length) {
      logger.info(`Attachments: ${safeAttachmentNames}`);
    }
    return true; // Pretend it was sent successfully
  }

  try {
    const info = await smtp.transporter.sendMail({
      from: smtp.from,
      to,
      subject,
      text,
      html: html || text,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        path: a.path,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    logger.info(`Email sent successfully via ${smtp.bron}-SMTP: ${info.messageId}`);
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
  associationId?: string | null,
  language?: string | null,
): Promise<boolean> => {
  // Get the frontend URL from environment or use default
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  // Users have no stored language preference; getPasswordResetEmail defaults to Dutch.
  const { subject, text, html } = getPasswordResetEmail({ userName, resetUrl }, language);

  return sendEmail({ to: email, subject, text, html, associationId });
};
