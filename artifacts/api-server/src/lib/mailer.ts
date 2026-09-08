import { Resend } from "resend";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const RESEND_FROM = "Survivor Sharks <noreply@survivorsharks.com>";
const SMTP_FROM = process.env.SMTP_FROM ?? RESEND_FROM;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export interface PickConfirmationItem {
  selection: string;
  matchup?: string | null;
  gameTime?: string | null;
}

export interface PicksConfirmationEmailInput {
  toEmail: string;
  username: string;
  poolName: string;
  confirmationNumber: string;
  submittedAt: Date;
  picks: PickConfirmationItem[];
}

export function createPickConfirmationNumber(): string {
  return randomUUID();
}

function formatConfirmationDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function buildPicksConfirmationEmail(input: PicksConfirmationEmailInput): {
  subject: string;
  html: string;
} {
  const safeUsername = escapeHtml(input.username);
  const safePoolName = escapeHtml(input.poolName);
  const safeConfirmationNumber = escapeHtml(input.confirmationNumber);
  const safeSubmittedAt = escapeHtml(formatConfirmationDate(input.submittedAt));
  const pickRows = input.picks.map((pick) => {
    const safeSelection = escapeHtml(pick.selection);
    const safeMatchup = pick.matchup ? escapeHtml(pick.matchup) : null;
    const safeGameTime = pick.gameTime ? escapeHtml(formatConfirmationDate(pick.gameTime)) : null;
    return `
      <div style="padding:16px;background:#111827;border:1px solid rgba(30,144,255,0.18);border-radius:8px">
        <div style="font-weight:bold;color:#f8fafc">${safeSelection}</div>
        ${safeMatchup ? `<div style="margin-top:5px;color:#cbd5e1;font-size:14px">${safeMatchup}</div>` : ""}
        ${safeGameTime ? `<div style="margin-top:5px;color:#64748b;font-size:12px">${safeGameTime}</div>` : ""}
      </div>`;
  }).join("");
  const subject = `Your picks are confirmed for ${input.poolName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:40px;border-radius:12px;border:1px solid rgba(30,144,255,0.2)">
      <h1 style="font-size:28px;letter-spacing:4px;color:#1e90ff;margin-bottom:8px">SURVIVOR SHARKS</h1>
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:28px">Picks confirmed</p>
      <p>Hi ${safeUsername}, your latest picks for <strong>${safePoolName}</strong> were recorded.</p>
      <div style="margin:22px 0;display:grid;gap:10px">${pickRows}</div>
      <div style="padding-top:18px;border-top:1px solid rgba(148,163,184,0.18);font-size:12px;color:#94a3b8;line-height:1.7">
        <div><strong>Submitted:</strong> ${safeSubmittedAt}</div>
        <div><strong>Confirmation:</strong> ${safeConfirmationNumber}</div>
      </div>
      <p style="margin-top:22px;font-size:12px;color:#64748b">A new confirmation is generated whenever your picks are saved or changed.</p>
    </div>`;
  return { subject, html };
}

export async function sendPicksConfirmationEmail(input: PicksConfirmationEmailInput): Promise<string | null> {
  const transport = createTransport();
  const { subject, html } = buildPicksConfirmationEmail(input);
  if (resend) {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: input.toEmail,
      subject,
      html,
    });
    if (error) throw new Error(`Resend picks confirmation email failed: ${error.message}`);
    return data?.id ?? null;
  }
  if (transport) {
    const result = await transport.sendMail({
      from: SMTP_FROM,
      to: input.toEmail,
      subject,
      html,
    });
    return result.messageId ?? null;
  }
  console.log(`\n====== PICKS CONFIRMATION (no email provider configured) ======\nTo: ${input.toEmail}\nPool: ${input.poolName}\nConfirmation: ${input.confirmationNumber}\nPicks: ${input.picks.map((pick) => pick.selection).join(", ")}\n================================================================\n`);
  return null;
}

export async function sendPickReminderEmail(
  toEmail: string,
  poolName: string,
  picksUrl: string,
  stage: "24h" | "final",
): Promise<string | null> {
  const transport = createTransport();
  const urgent = stage === "final";
  const safePoolName = escapeHtml(poolName);
  const safeUrl = escapeHtml(picksUrl);
  const subject = urgent
    ? `Final reminder: make your picks for ${poolName}`
    : `Don't forget your picks for ${poolName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:40px;border-radius:12px">
      <h1 style="font-size:28px;letter-spacing:4px;color:#1e90ff">SURVIVOR SHARKS</h1>
      <p>${urgent ? "<strong>Your pick deadline is coming up soon.</strong>" : "Your next pick window closes within 24 hours."}</p>
      <p>Make your picks for <strong>${safePoolName}</strong> before the deadline.</p>
      <a href="${safeUrl}" style="display:inline-block;padding:14px 32px;background:#1e90ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">MAKE PICKS</a>
      <p style="margin-top:24px;font-size:11px;color:#64748b;word-break:break-all">${safeUrl}</p>
    </div>`;
  if (resend) {
    const { data, error } = await resend.emails.send({ from: RESEND_FROM, to: toEmail, subject, html });
    if (error) throw new Error(`Resend pick reminder email failed: ${error.message}`);
    return data?.id ?? null;
  }
  if (transport) {
    const result = await transport.sendMail({ from: SMTP_FROM, to: toEmail, subject, html });
    return result.messageId ?? null;
  }
  console.log(`\n====== PICK REMINDER (no email provider configured) ======\nTo: ${toEmail}\nPool: ${poolName}\nURL: ${picksUrl}\n=====================================================\n`);
  return null;
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const transport = createTransport();

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:40px;border-radius:12px;border:1px solid rgba(30,144,255,0.2)">
      <h1 style="font-size:28px;letter-spacing:4px;color:#1e90ff;margin-bottom:8px">SURVIVOR SHARKS</h1>
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:32px">Password Reset</p>
      <p style="margin-bottom:16px">Someone requested a password reset for your account. If this was you, click the button below. This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#1e90ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;letter-spacing:2px;font-size:14px;text-transform:uppercase">
        Reset My Password
      </a>
      <p style="margin-top:32px;font-size:12px;color:#64748b">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
      <p style="margin-top:8px;font-size:11px;color:#475569;word-break:break-all">${resetUrl}</p>
    </div>
  `;

  if (resend) {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: toEmail,
      subject: "Reset your Survivor Sharks password",
      html,
    });

    if (error) {
      throw new Error(`Resend password reset email failed: ${error.message}`);
    }

    return;
  }

  if (transport) {
    await transport.sendMail({ from: SMTP_FROM, to: toEmail, subject: "Reset your Survivor Sharks password", html });
    return;
  }

  // Dev fallback — print reset link to server console
  console.log(`\n====== PASSWORD RESET LINK (no email provider configured) ======\nTo: ${toEmail}\nURL: ${resetUrl}\n======================================================\n`);
}

export async function sendEmailVerificationEmail(toEmail: string, verificationUrl: string): Promise<void> {
  const transport = createTransport();

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:40px;border-radius:12px;border:1px solid rgba(30,144,255,0.2)">
      <h1 style="font-size:28px;letter-spacing:4px;color:#1e90ff;margin-bottom:8px">SURVIVOR SHARKS</h1>
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:32px">Verify your email</p>
      <p style="margin-bottom:16px">Confirm your email address to receive Survivor Sharks pick reminders. This link expires in <strong>24 hours</strong>.</p>
      <a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;background:#1e90ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;letter-spacing:2px;font-size:14px;text-transform:uppercase">
        Verify My Email
      </a>
      <p style="margin-top:32px;font-size:12px;color:#64748b">If you didn't create this account, you can safely ignore this email.</p>
      <p style="margin-top:8px;font-size:11px;color:#475569;word-break:break-all">${verificationUrl}</p>
    </div>
  `;

  if (resend) {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: toEmail,
      subject: "Verify your Survivor Sharks email",
      html,
    });

    if (error) {
      throw new Error(`Resend verification email failed: ${error.message}`);
    }

    return;
  }

  if (transport) {
    await transport.sendMail({ from: SMTP_FROM, to: toEmail, subject: "Verify your Survivor Sharks email", html });
    return;
  }

  console.log(`\n====== EMAIL VERIFICATION LINK (no email provider configured) ======\nTo: ${toEmail}\nURL: ${verificationUrl}\n====================================================================\n`);
}

export async function sendPlayerFeedbackEmail(
  toEmail: string,
  username: string,
  senderEmail: string,
  message: string,
): Promise<void> {
  const transport = createTransport();
  const safeUsername = escapeHtml(username);
  const safeSenderEmail = escapeHtml(senderEmail);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br />");
  const subject = `Survivor Sharks feedback from ${username}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:40px;border-radius:12px;border:1px solid rgba(30,144,255,0.2)">
      <h1 style="font-size:28px;letter-spacing:4px;color:#1e90ff;margin-bottom:8px">SURVIVOR SHARKS</h1>
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:28px">Player feedback</p>
      <p><strong>From:</strong> ${safeUsername} &lt;${safeSenderEmail}&gt;</p>
      <div style="margin-top:24px;padding:20px;background:#111827;border-radius:8px;line-height:1.6;white-space:normal">${safeMessage}</div>
    </div>
  `;

  if (resend) {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: toEmail,
      subject,
      html,
      replyTo: senderEmail,
    });
    if (error) throw new Error(`Resend feedback email failed: ${error.message}`);
    return;
  }

  if (transport) {
    await transport.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      html,
      replyTo: senderEmail,
    });
    return;
  }

  console.log(`\n====== PLAYER FEEDBACK (no email provider configured) ======\nTo: ${toEmail}\nFrom: ${username} <${senderEmail}>\nMessage: ${message}\n============================================================\n`);
}
