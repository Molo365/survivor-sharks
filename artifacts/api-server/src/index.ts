import app from "./app";
import { logger } from "./lib/logger";
import { startAutoEliminator } from "./lib/auto-eliminator";
import { startPoolCleanup } from "./lib/pool-cleanup";
import { startPickReminderScheduler } from "./lib/pick-reminders";
import { ensureDbPatches } from "./lib/ensure-db-patches";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  try {
    await ensureDbPatches();
  } catch (err) {
    logger.error({ err }, "Database startup patches failed");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startAutoEliminator();
    startPickReminderScheduler();
    if (process.env["ENABLE_POOL_CLEANUP"] === "true") {
      startPoolCleanup();
    }
  });
}

startServer();
