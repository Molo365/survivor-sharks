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

const FROM = process.env.SMTP_FROM ?? "Survivor Sharks <noreply@survivorsharks.app>";

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

  if (transport) {
    await transport.sendMail({ from: FROM, to: toEmail, subject: "Reset your Survivor Sharks password", html });
  } else {
    // Dev fallback — print reset link to server console
    console.log(`\n====== PASSWORD RESET LINK (no SMTP configured) ======\nTo: ${toEmail}\nURL: ${resetUrl}\n======================================================\n`);
  }
}
