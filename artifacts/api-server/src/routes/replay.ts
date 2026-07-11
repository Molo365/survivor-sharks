import { Router } from "express";
import { db } from "@workspace/db";
import { sandboxGameScoresTable, poolsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth, requireCommissioner } from "../middlewares/auth";
import { fetchAndStoreReplayWeek } from "../lib/replayMode";

const router = Router({ mergeParams: true });

// POST /api/pools/:poolId/replay/start
// Commissioner: fetch 2025 ESPN data for `week`, compress kickoff times, arm replay clock
router.post("/start", requireAuth, requireCommissioner, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week, startTime } = req.body as { week?: unknown; startTime?: unknown };

  if (typeof week !== "number" || week < 1 || week > 18) {
    res.status(400).json({ error: "week must be a number between 1 and 18" });
    return;
  }
  if (typeof startTime !== "string" || isNaN(Date.parse(startTime))) {
    res.status(400).json({ error: "startTime must be a valid ISO date string" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (!pool.sandboxMode) {
    res.status(400).json({ error: "Pool must be in sandbox mode to use Replay Mode" });
    return;
  }
  if (pool.sport !== "nfl") {
    res.status(400).json({ error: "Replay Mode is only available for NFL pools" });
    return;
  }

  await fetchAndStoreReplayWeek(poolId, week, new Date(startTime));

  const rows = await db
    .select({ id: sandboxGameScoresTable.id })
    .from(sandboxGameScoresTable)
    .where(and(
      eq(sandboxGameScoresTable.poolId, poolId),
      eq(sandboxGameScoresTable.week, week),
      isNotNull(sandboxGameScoresTable.replayKickoff),
    ));

  req.log.info({ poolId, week, gamesLoaded: rows.length }, "Replay Mode armed");
  res.json({ success: true, gamesLoaded: rows.length });
});

// GET /api/pools/:poolId/replay/status
// Any pool member: returns current replay state for the pool
router.get("/status", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const games = await db
    .select({
      gameId: sandboxGameScoresTable.gameId,
      gameStatus: sandboxGameScoresTable.gameStatus,
      replayKickoff: sandboxGameScoresTable.replayKickoff,
      homeScore: sandboxGameScoresTable.homeScore,
      awayScore: sandboxGameScoresTable.awayScore,
    })
    .from(sandboxGameScoresTable)
    .where(and(
      eq(sandboxGameScoresTable.poolId, poolId),
      isNotNull(sandboxGameScoresTable.replayKickoff),
    ));

  const active = games.length > 0;
  const live = games.filter(g => g.gameStatus && g.gameStatus !== "scheduled" && g.gameStatus !== "final").length;
  const finalCount = games.filter(g => g.gameStatus === "final").length;
  const pending = games.filter(g => !g.gameStatus || g.gameStatus === "scheduled").length;

  res.json({ active, summary: { live, final: finalCount, pending }, games });
});

export default router;
