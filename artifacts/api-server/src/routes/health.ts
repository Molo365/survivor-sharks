import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkDatabase, checkEspnNflScoreboard, envPresence } from "../lib/ops-readiness";
import { getMaintenanceState } from "../lib/maintenance";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Readiness probe: DB + ESPN from this host (works during site maintenance).
 * Does not expose secret values — only whether expected env vars are set.
 */
router.get("/healthz/ready", async (_req, res) => {
  const [database, espn, maintenance] = await Promise.all([
    checkDatabase(),
    checkEspnNflScoreboard(),
    getMaintenanceState(),
  ]);
  const env = envPresence();
  const ok = database.ok && espn.ok && env.databaseUrl && env.sessionSecret;
  res.status(ok ? 200 : 503).json({
    ok,
    maintenance: { enabled: maintenance.enabled },
    database,
    espn: {
      ok: espn.ok,
      nflSampleEventCount: espn.eventCount,
      usesApiKey: false,
      error: espn.error ?? null,
    },
    env,
    notes: [
      "Schedules use ESPN public HTTP — there is no ESPN API key in Survivor Sharks.",
      "Railway dashboard API token resets do not affect live game loads.",
      "Rotating SESSION_SECRET invalidates existing login tokens until users sign in again.",
    ],
  });
});

export default router;
