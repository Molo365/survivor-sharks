import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendPlayerFeedbackEmail } from "../lib/mailer";

const router = Router();
const FEEDBACK_COOLDOWN_MS = 60 * 1000;
const feedbackCooldowns = new Map<number, number>();

function getCooldownRemainingSeconds(userId: number): number {
  const lastSubmittedAt = feedbackCooldowns.get(userId);
  if (!lastSubmittedAt) return 0;
  const remainingMs = FEEDBACK_COOLDOWN_MS - (Date.now() - lastSubmittedAt);
  if (remainingMs <= 0) {
    feedbackCooldowns.delete(userId);
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

async function getFeedbackRecipientEmail(): Promise<string | null> {
  const configuredEmail = process.env.FEEDBACK_RECIPIENT_EMAIL?.trim();
  if (configuredEmail) return configuredEmail;

  const [admin] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  return admin?.email ?? null;
}

// POST /api/feedback
router.post("/", requireAuth, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  if (message.length > 5000) {
    res.status(400).json({ error: "Message must be 5000 characters or fewer" });
    return;
  }

  const userId = req.user!.id;
  const retryAfterSeconds = getCooldownRemainingSeconds(userId);
  if (retryAfterSeconds > 0) {
    res
      .status(429)
      .setHeader("Retry-After", retryAfterSeconds)
      .json({ error: `Please wait ${retryAfterSeconds} seconds before sending another message` });
    return;
  }

  const recipientEmail = await getFeedbackRecipientEmail();
  if (!recipientEmail) {
    res.status(503).json({ error: "Feedback email delivery is not configured" });
    return;
  }

  feedbackCooldowns.set(userId, Date.now());
  try {
    await sendPlayerFeedbackEmail(
      recipientEmail,
      req.user!.username,
      req.user!.email,
      message,
    );
    res.json({ success: true, message: "Thanks, we got your message" });
  } catch (error) {
    feedbackCooldowns.delete(userId);
    console.error("Player feedback delivery failed", error);
    res.status(502).json({ error: "We couldn't send your message. Please try again." });
  }
});

export default router;