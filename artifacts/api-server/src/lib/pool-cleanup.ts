import { db } from "@workspace/db";
import { poolsTable } from "@workspace/db";
import { lt, and, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function runCleanup() {
  const cutoff = new Date(Date.now() - RETENTION_MS);
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
  logger.info({ intervalMs: CLEANUP_INTERVAL_MS }, "Pool cleanup scheduler started");
}
