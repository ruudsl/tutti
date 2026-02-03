import nodemailer from 'nodemailer';
import logger from './logger';

// Create transporter based on environment
const createTransporter = () => {
  // In production, use real SMTP settings from environment variables
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

  // For development/testing, use ethereal email (fake SMTP)
  // Or just log to console if no SMTP configured
  logger.warn('No SMTP configuration found. Emails will be logged to console only.');
  return null;
};

const transporter = createTransporter();

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const { to, subject, text, html } = options;

  // Log email for development/debugging
  logger.info(`Sending email to ${to}: ${subject}`);

  if (!transporter) {
    // Log the email content when no SMTP is configured
    logger.info('Email content (no SMTP configured):');
    logger.info(`To: ${to}`);
    logger.info(`Subject: ${subject}`);
    logger.info(`Body: ${text}`);
    return true; // Pretend it was sent successfully
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Harmonie App" <noreply@harmonie.app>',
      to,
      subject,
      text,
      html: html || text,
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
  userName: string
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

  return sendEmail({ to: email, subject, text, html });
};
