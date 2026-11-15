import nodemailer from 'nodemailer';
import { getSettingsGroup } from './settings.service';
import { logger } from '@/lib/logger';

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; messageId?: string }> {
  const mail = await getSettingsGroup('mail');

  if (!mail.host) {
    logger.info({ to: params.to, subject: params.subject }, 'SMTP not configured; email logged only');
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: mail.username ? { user: mail.username, pass: mail.password } : undefined,
  });

  const info = await transporter.sendMail({
    from: `"${mail.fromName}" <${mail.fromAddress}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  return { sent: true, messageId: info.messageId };
}
