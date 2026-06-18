import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  isPickLocked,
  isMlbPickDeadlinePassed,
  getTodayEtDate,
  formatDateEt,
  isDailyPickDeadlinePassed,
  fetchGamesForDate,
} from "../lib/espn";
import { resolveTeam } from "../lib/teams-data";
import { getSandboxGamesForWeek } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

function formatPick(pick: typeof picksTable.$inferSelect, username: string) {
  return {
    id: pick.id,
    entryId: pick.entryId,
    poolId: pick.poolId,
    userId: pick.userId,
    username,
    teamId: pick.teamId,
    teamName: pick.teamName,
    teamLogoUrl: pick.teamLogoUrl,
    week: pick.week,
    pickDate: pick.pickDate ?? null,
    result: pick.result,
    submittedAt: pick.submittedAt.toISOString(),
  };
}

// GET /api/pools/:poolId/picks  — current user's picks in this pool
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const picks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  res.json(picks.map(p => formatPick(p, req.user!.username)));
});

// POST /api/pools/:poolId/picks
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const { teamId, week, teamName: clientTeamName, teamLogoUrl: clientTeamLogoUrl } = req.body;

  if (!teamId) {
    res.status(400).json({ error: "teamId is required" });
    return;
  }

  // Load pool first (needed to determine pick flow)
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  // Check entry exists and is alive
  const [entry] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);

  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }
  if (entry.status === "eliminated") {
    res.status(400).json({ error: "Eliminated players cannot make picks" });
    return;
  }

  // Load all user's picks for this pool
  const previousPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  // Resolve team metadata (prefer client-supplied values for accuracy)
  const resolved = resolveTeam(pool.sport, teamId);
  const teamName = (typeof clientTeamName === "string" && clientTeamName.trim())
    ? clientTeamName.trim()
    : resolved.teamName;
  const teamLogoUrl = (typeof clientTeamLogoUrl === "string" && clientTeamLogoUrl)
    ? clientTeamLogoUrl
    : resolved.teamLogoUrl;

  // ── DAILY MLB PICK FLOW ──────────────────────────────────────────────────
  if (pool.pickFrequency === "daily") {
    const todayEt = getTodayEtDate();
    const todayEspn = formatDateEt(new Date());
    const todayGames = await fetchGamesForDate("mlb", todayEspn);

    // Deadline: 5 minutes before first game of the day
    if (isDailyPickDeadlinePassed(todayGames)) {
      res.status(400).json({
        error: "Daily pick deadline has passed — picks are locked for today.",
      });
      return;
    }

    // New team's game must not have started
    const newTeamGame = todayGames.find(g =>
      g.homeTeam.id === teamId || g.awayTeam.id === teamId
    );
    if (newTeamGame?.hasStarted) {
      res.status(400).json({
        error: "That team's game has already started — choose a different team.",
      });
      return;
    }

    // If player already has a pick today, check whether it's locked
    const existingDailyPick = previousPicks.find(p => p.pickDate === todayEt);
    if (existingDailyPick) {
      const existingGame = todayGames.find(g =>
        g.homeTeam.id === existingDailyPick.teamId || g.awayTeam.id === existingDailyPick.teamId
      );
      if (existingGame?.hasStarted) {
        res.status(400).json({
          error: `Your pick (${existingDailyPick.teamName}) is locked — that game has already started.`,
        });
        return;
      }
    }

    // Team re-use: cannot pick the same team on any other day
    const usedOnAnotherDay = previousPicks.some(
      p => p.teamId === teamId && p.pickDate !== todayEt
    );
    if (usedOnAnotherDay) {
      res.status(400).json({ error: "You have already used this team on a previous day." });
      return;
    }

    // Upsert the daily pick (week = pool's current day counter)
    const dayNum = pool.currentWeek;
    let pick: typeof picksTable.$inferSelect;

    if (existingDailyPick) {
      const [updated] = await db.update(picksTable).set({
        teamId, teamName, teamLogoUrl, result: "pending",
      }).where(eq(picksTable.id, existingDailyPick.id)).returning();
      pick = updated;
    } else {
      const [inserted] = await db.insert(picksTable).values({
        entryId: entry.id,
        poolId,
        userId,
        teamId,
        teamName,
        teamLogoUrl,
        week: dayNum,
        pickDate: todayEt,
        result: "pending",
      }).returning();
      pick = inserted;
    }

    res.status(201).json(formatPick(pick, req.user!.username));
    return;
  }

  // ── WEEKLY / SEASON PICK FLOW ────────────────────────────────────────────
  if (!week) {
    res.status(400).json({ error: "teamId and week are required" });
    return;
  }

  const existingPick = previousPicks.find(p => p.week === week);

  // ── Lock checks (skipped when sandbox mode is on) ────────────────────────
  if (!pool.sandboxMode) {
  if (pool.sport === "mlb") {
    // MLB weekly: entire week locks on Monday 10 PM ET
    if (isMlbPickDeadlinePassed(pool.createdAt, pool.currentWeek)) {
      res.status(400).json({
        error: "MLB pick deadline has passed (Monday 10 PM ET). Picks are locked for this week.",
      });
      return;
    }
  } else {
    // All other sports: lock once the picked team's game has started
    if (existingPick) {
      const currentlyLocked = await isPickLocked(pool.sport, existingPick.teamId, week);
      if (currentlyLocked) {
        res.status(400).json({
          error: `Your pick (${existingPick.teamName}) is locked — that game has already started`,
        });
        return;
      }
    }
    const newTeamLocked = await isPickLocked(pool.sport, teamId, week);
    if (newTeamLocked) {
      res.status(400).json({
        error: "That team's game has already started — choose a team that hasn't played yet",
      });
      return;
    }
  }
  } // end !pool.sandboxMode

  // Team re-use rules depend on pool type
  if (pool.poolType !== "weekly") {
    const relevantPicks = pool.poolType === "mid_season" && pool.startWeek
      ? previousPicks.filter(p => p.week >= pool.startWeek!)
      : previousPicks;

    const alreadyUsed = relevantPicks.some(p => p.teamId === teamId && p.week !== week);
    if (alreadyUsed) {
      res.status(400).json({ error: "You have already used this team in a previous week" });
      return;
    }
  }

  // Upsert pick for this week
  let pick: typeof picksTable.$inferSelect;

  if (existingPick) {
    const [updated] = await db.update(picksTable).set({
      teamId, teamName, teamLogoUrl, result: "pending",
    }).where(eq(picksTable.id, existingPick.id)).returning();
    pick = updated;
  } else {
    const [inserted] = await db.insert(picksTable).values({
      entryId: entry.id,
      poolId,
      userId,
      teamId,
      teamName,
      teamLogoUrl,
      week,
      result: "pending",
    }).returning();
    pick = inserted;
  }

  res.status(201).json(formatPick(pick, req.user!.username));
});

// POST /api/pools/:poolId/picks/simulate-grading — sandbox grading for Classic/Weekly Survivor
router.post("/simulate-grading", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }
  if (pool.sport !== "nfl") {
    res.status(400).json({ error: "Simulate grading is only available for NFL pools" }); return;
  }

  const week = pool.sandboxWeek ?? pool.currentWeek;
  const games = getSandboxGamesForWeek(week);

  // Random NFL-realistic scores (10–45, no ties)
  const winnerByTeamId = new Map<string, string>();
  for (const game of games) {
    let homeScore = 10 + Math.floor(Math.random() * 36);
    let awayScore = 10 + Math.floor(Math.random() * 36);
    if (homeScore === awayScore) homeScore += 3;
    const winner = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
    winnerByTeamId.set(game.homeTeamId, winner);
    winnerByTeamId.set(game.awayTeamId, winner);
  }

  const pendingPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week), eq(picksTable.result, "pending")));

  let graded = 0;
  const lostEntryIds = new Set<number>();

  for (const pick of pendingPicks) {
    const winner = winnerByTeamId.get(pick.teamId);
    if (winner === undefined) continue;
    const result: "win" | "loss" = pick.teamId === winner ? "win" : "loss";
    await db.update(picksTable).set({ result }).where(eq(picksTable.id, pick.id));
    if (result === "loss") lostEntryIds.add(pick.entryId);
    graded++;
  }

  for (const entryId of lostEntryIds) {
    await db.update(entriesTable).set({ status: "eliminated" }).where(eq(entriesTable.id, entryId));
  }

  res.json({ graded, week, eliminated: lostEntryIds.size });
});

export default router;
