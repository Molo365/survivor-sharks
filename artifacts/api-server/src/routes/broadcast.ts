import { Router } from "express";
import { db, poolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCommissioner } from "../middlewares/auth";
import {
  getBroadcastStandings,
  isSupportedBroadcastPool,
} from "../lib/broadcast-standings";
import { resolveBroadcastRecipients } from "../lib/broadcast-recipients";
import { deliverBroadcastEmails } from "../lib/broadcast-delivery";
import { sendBroadcastEmail } from "../lib/mailer";

const router = Router({ mergeParams: true });
const MAX_BROADCAST_MESSAGE_LENGTH = 5000;

export function getBroadcastAppBaseUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) {
    throw new Error("APP_URL must be configured for commissioner broadcasts");
  }

  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_URL must use http or https");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

router.post("/", requireAuth, requireCommissioner, async (req, res) => {
  const poolId = Number.parseInt(String(req.params.poolId), 10);
  if (!Number.isInteger(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  if (message.length > MAX_BROADCAST_MESSAGE_LENGTH) {
    res.status(400).json({
      error: `Message must be ${MAX_BROADCAST_MESSAGE_LENGTH} characters or fewer`,
    });
    return;
  }

  const [pool] = await db
    .select()
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  if (!isSupportedBroadcastPool(pool)) {
    res.status(400).json({
      error: "Commissioner broadcasts currently support NFL Survivor, NFL Pick-Em Season, NFL Confidence Season, NFL Confidence Weekly, and NFL Division Predictor pools only",
    });
    return;
  }

  try {
    const standingsSnapshot = await getBroadcastStandings(pool);
    const { eligible, skipped } = await resolveBroadcastRecipients(poolId);
    const poolUrl = `${getBroadcastAppBaseUrl()}/pools/${poolId}`;

    const { sent, failed } = await deliverBroadcastEmails(
      eligible,
      (recipient) => sendBroadcastEmail(
        recipient.email,
        pool.name,
        message,
        standingsSnapshot,
        poolUrl,
      ),
      5,
      (recipient, error) => {
        req.log.warn(
          { err: error, poolId, recipientUserId: recipient.userId },
          "Commissioner broadcast email failed for recipient",
        );
      },
    );

    req.log.info(
      { poolId, senderUserId: req.user!.id, sent, skipped, failed },
      "Commissioner broadcast email completed",
    );
    res.json({ sent, skipped, failed });
  } catch (error) {
    req.log.error({ err: error, poolId }, "Commissioner broadcast email failed");
    res.status(500).json({ error: "Failed to send commissioner broadcast" });
  }
});

export default router;