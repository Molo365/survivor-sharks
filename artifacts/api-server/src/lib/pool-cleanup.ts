import { db } from "@workspace/db";
import { poolsTable } from "@workspace/db";
import { lt, and, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETENTION_MONTHS = 6;

async function runCleanup() {
  const now = new Date();
  const cutoff = new Date(now);
  const originalDay = cutoff.getDate();
  // Clamp the day when the target month is shorter (for example, Aug 31 → Feb)
  // so the cutoff remains exactly six calendar months ago instead of rolling
  // into a seventh month.
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const lastDayOfTargetMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  try {
    const deleted = await db
      .delete(poolsTable)
      .where(and(isNotNull(poolsTable.endedAt), lt(poolsTable.endedAt, cutoff)))
      .returning({ id: poolsTable.id });
    if (deleted.length > 0) {
      logger.info({ count: deleted.length, cutoff }, "Pool cleanup: deleted expired pools");
    }
  } catch (err) {
    logger.error({ err }, "Pool cleanup: error during scheduled deletion");
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startPoolCleanup() {
  if (_timer) return;
  void runCleanup();
  _timer = setInterval(() => { void runCleanup(); }, CLEANUP_INTERVAL_MS);
    logger.info({ intervalMs: CLEANUP_INTERVAL_MS, retentionMonths: RETENTION_MONTHS }, "Pool cleanup scheduler started");
}
