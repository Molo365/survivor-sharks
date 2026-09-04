import { Resend } from "resend";
import nodemailer from "nodemailer";

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
