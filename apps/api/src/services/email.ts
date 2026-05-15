/**
 * Transactional email via Amazon SES.
 *
 * Configuration (env):
 *   AWS_REGION                  e.g. us-east-1
 *   AWS_ACCESS_KEY_ID           IAM user with ses:SendEmail
 *   AWS_SECRET_ACCESS_KEY
 *   EMAIL_FROM                  e.g. "SwipeHire <hello@swipehire.io>" — must be SES-verified
 *   APP_URL                     e.g. https://app.swipehire.io  (used to build links)
 *
 * If the env is incomplete the helper logs and returns { skipped: true }
 * instead of throwing — auth flows must still work locally without SES.
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { pino } from 'pino';

const log = pino({ name: 'email' });

let client: SESClient | null = null;

function getClient(): SESClient | null {
  if (client) return client;
  const region = process.env.AWS_REGION;
  const keyId = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !keyId || !secret) return null;
  client = new SESClient({
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  });
  return client;
}

export interface EmailResult {
  sent: boolean;
  skipped?: boolean;
  messageId?: string;
  reason?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const c = getClient();
  const from = process.env.EMAIL_FROM;
  if (!c || !from) {
    log.warn({ to: opts.to, subject: opts.subject }, 'SES not configured; skipping email');
    return { sent: false, skipped: true, reason: 'ses_not_configured' };
  }
  try {
    const out = await c.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [opts.to] },
      Message: {
        Subject: { Charset: 'UTF-8', Data: opts.subject },
        Body: {
          Html: { Charset: 'UTF-8', Data: opts.html },
          Text: { Charset: 'UTF-8', Data: opts.text },
        },
      },
    }));
    return { sent: true, messageId: out.MessageId };
  } catch (err: any) {
    log.error({ err: err.message, to: opts.to }, 'SES send failed');
    return { sent: false, reason: err.message };
  }
}

const APP_URL = () => process.env.APP_URL ?? 'https://app.swipehire.io';

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:22px;font-weight:600;margin-bottom:16px">${title}</div>
    ${bodyHtml}
    <hr style="margin:32px 0;border:none;border-top:1px solid #eee"/>
    <div style="font-size:12px;color:#888">SwipeHire · <a href="${APP_URL()}" style="color:#888">app.swipehire.io</a></div>
  </div></body></html>`;
}

export function sendWelcomeEmail(to: string, firstName: string): Promise<EmailResult> {
  const url = APP_URL();
  return sendEmail({
    to,
    subject: 'Welcome to SwipeHire',
    html: shell('Welcome to SwipeHire', `
      <p>Hi ${firstName},</p>
      <p>Thanks for signing up. SwipeHire matches you to roles using real DOL H-1B data, live ATS feeds, and a transparent scoring model — no fluff.</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open SwipeHire</a>
      </p>
      <p style="color:#666;font-size:14px">If this wasn't you, just ignore this email.</p>
    `),
    text: `Hi ${firstName},\n\nThanks for signing up to SwipeHire.\nOpen the app: ${url}\n\nIf this wasn't you, ignore this email.`,
  });
}

export function sendPasswordResetEmail(to: string, resetToken: string): Promise<EmailResult> {
  const url = `${APP_URL()}/reset-password?token=${encodeURIComponent(resetToken)}`;
  return sendEmail({
    to,
    subject: 'Reset your SwipeHire password',
    html: shell('Reset your password', `
      <p>We got a request to reset your SwipeHire password.</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Reset password</a>
      </p>
      <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request this, you can ignore the email — your password won't change.</p>
    `),
    text: `Reset your SwipeHire password:\n${url}\n\nThis link expires in 1 hour. Ignore if you didn't request it.`,
  });
}
