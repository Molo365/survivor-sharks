import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, entriesTable, usersTable, picksTable, pickemPicksTable, wcBracketPicksTable, nflDivisionPredictorPicksTable, groupStagePredictorPicksTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and, count, ne, inArray, or, lte, isNotNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { nanoid } from "../lib/nanoid";
import { fetchGamesForDate, getTodayEtDate } from "../lib/espn";

const router = Router();

function generateInviteCode() {
  return nanoid(8).toUpperCase();
}

type PoolRow = typeof poolsTable.$inferSelect;

function formatPool(pool: PoolRow, memberCount: number, activeCount: number, commissionerName: string) {
  return {
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    poolType: pool.poolType,
    startWeek: pool.startWeek ?? null,
    description: pool.description,
    inviteCode: pool.inviteCode,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isActive: pool.isActive,
    memberCount,
    activeCount,
    commissionerId: pool.commissionerId,
    commissionerName,
    maxEntries: pool.maxEntries,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    prizeStructure: pool.prizeStructure ?? null,
    prizeMode: pool.prizeMode ?? "fixed",
    doubleElimination: pool.doubleElimination,
    pickFrequency: pool.pickFrequency,
    isRecurring: pool.isRecurring,
    minEntries: pool.minEntries ?? null,
    closureReason: pool.closureReason ?? null,
    createdAt: pool.createdAt.toISOString(),
    endedAt: pool.endedAt?.toISOString() ?? null,
    sandboxMode: pool.sandboxMode ?? false,
    sandboxWeek: pool.sandboxWeek ?? 1,
  };
}

// GET /api/pools — active lobby: pools that are active OR ended within the last 2 days
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const memberships = await db.select({ poolId: entriesTable.poolId })
    .from(entriesTable)
    .where(eq(entriesTable.userId, userId));

  const poolIds = memberships.map(m => m.poolId);
  if (poolIds.length === 0) {
    res.json([]);
    return;
  }

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const pools = await db.select().from(poolsTable)
    .where(and(
      inArray(poolsTable.id, poolIds),
      or(
        eq(poolsTable.isActive, true),
        and(isNotNull(poolsTable.endedAt), gt(poolsTable.endedAt, twoDaysAgo))
      )
    ));

  // ── Compute hasLiveGames per pool ──────────────────────────────────────
  const todayEt = getTodayEtDate();
  const todayDateStr = todayEt.replace(/-/g, "");

  // Sandbox pools: check the DB for any row with game_status = "in_progress"
  const sandboxPoolIds = pools.filter((p) => p.sandboxMode).map((p) => p.id);
  const sandboxLiveSet = new Set<number>();
  if (sandboxPoolIds.length > 0) {
    const liveRows = await db
      .select({ poolId: sandboxGameScoresTable.poolId })
      .from(sandboxGameScoresTable)
      .where(and(
        inArray(sandboxGameScoresTable.poolId, sandboxPoolIds),
        inArray(sandboxGameScoresTable.gameStatus, ["q1", "q2", "half", "q3", "q4", "in_progress"]),
      ));
    for (const r of liveRows) sandboxLiveSet.add(r.poolId);
  }

  // Live pools: fetch ESPN once per unique sport (only active pools can have live games)
  const activeLivePools = pools.filter((p) => p.isActive && !p.sandboxMode);
  const uniqueSports = [...new Set(activeLivePools.map((p) => p.sport))];
  const sportsWithLive = new Set<string>();
  await Promise.all(uniqueSports.map(async (sport) => {
    const games = await fetchGamesForDate(sport, todayDateStr);
    if (games.some((g) => g.status === "in_progress")) sportsWithLive.add(sport);
  }));

  const hasLiveGamesFor = (pool: PoolRow): boolean => {
    if (pool.sandboxMode) return sandboxLiveSet.has(pool.id);
    if (!pool.isActive) return false;
    return sportsWithLive.has(pool.sport);
  };

  const result = await Promise.all(pools.map(async (pool) => {
    const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
    const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));
    return { ...formatPool(pool, Number(total), Number(active), commissioner?.username ?? ""), hasLiveGames: hasLiveGamesFor(pool) };
  }));

  res.json(result);
});

// GET /api/pools/past — pools ended >2 days ago, within the 30-day retention window
router.get("/past", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const memberships = await db.select({ poolId: entriesTable.poolId })
    .from(entriesTable)
    .where(eq(entriesTable.userId, userId));

  const poolIds = memberships.map(m => m.poolId);
  if (poolIds.length === 0) {
    res.json([]);
    return;
  }

  const SURVIVOR_POOL_TYPES = ["season", "weekly", "mid_season"] as const;

  const pools = await db.select().from(poolsTable)
    .where(and(
      inArray(poolsTable.id, poolIds),
      eq(poolsTable.isActive, false),
      isNotNull(poolsTable.endedAt),
    ));

  const result = await Promise.all(pools.map(async (pool) => {
    const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

    let winnerName: string | null = null;
    if ((SURVIVOR_POOL_TYPES as readonly string[]).includes(pool.poolType)) {
      const alive = await db
        .select({ username: usersTable.username, displayName: usersTable.displayName })
        .from(entriesTable)
        .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
        .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")))
        .limit(1);
      if (alive.length === 1) {
        winnerName = alive[0].displayName ?? alive[0].username;
      }
    }

    return {
      id: pool.id,
      name: pool.name,
      sport: pool.sport,
      poolType: pool.poolType,
      currentWeek: pool.currentWeek,
      season: pool.season,
      memberCount: Number(total),
      commissionerId: pool.commissionerId,
      commissionerName: commissioner?.username ?? null,
      endedAt: pool.endedAt!.toISOString(),
      winnerName,
    };
  }));

  res.json(result);
});

// POST /api/pools
router.post("/", requireAuth, async (req, res) => {
  if (process.env.POOL_CREATION_OPEN !== "true" && req.user!.role !== "admin") {
    res.status(403).json({ error: "Pool creation is not yet available." });
    return;
  }

  const { name, sport, description, maxEntries, minEntries, entryFee, prizeStructure, currentWeek, season, poolType, startWeek, doubleElimination, pickFrequency, isRecurring, sandboxMode } = req.body;
  const prizeMode = "pct" as const;

  if (!name || !sport) {
    res.status(400).json({ error: "name and sport are required" });
    return;
  }

  const resolvedPoolType = (poolType as typeof poolsTable.$inferInsert["poolType"]) ?? "season";
  if (resolvedPoolType === "mid_season" && !startWeek) {
    res.status(400).json({ error: "startWeek is required for mid_season pools" });
    return;
  }

  const dailySports = ["mlb", "intl"];
  const resolvedPickFrequency = (pickFrequency === "daily" && dailySports.includes(sport)) ? "daily" : "weekly";

  // commissionerCut: integer 0–15, default 0.
  const rawCut = req.body.commissionerCut ?? 0;
  const commissionerCut = Number(rawCut);
  const showCommissionerCut: boolean = req.body.showCommissionerCut === true;
  if (!Number.isInteger(commissionerCut) || commissionerCut < 0 || commissionerCut > 15) {
    res.status(400).json({ error: "commissionerCut must be an integer between 0 and 15" });
    return;
  }

  // prizeStructure amounts are percentages (0–100). prizePot is always null
  // (computed at payout time as entryFee × actualEntries).
  const resolvedPrizeStructure = Array.isArray(prizeStructure) && prizeStructure.length > 0
    ? prizeStructure as Array<{ place: number; amount: number }>
    : null;
  const resolvedPrizePot: number | null = null;

  // Validate that prizeStructure % + commissionerCut sums to exactly 100 (±0.5 tolerance).
  if (resolvedPrizeStructure) {
    const pctSum = resolvedPrizeStructure.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const total = pctSum + commissionerCut;
    if (Math.abs(total - 100) > 0.5) {
      res.status(400).json({
        error: `Prize percentages + commissioner cut must sum to 100 (got ${total.toFixed(2)})`,
      });
      return;
    }
  }

  // Crazy 8's MLB pools require at least 8 games on today's slate
  if (resolvedPoolType === "crazy_8s" && sport === "mlb") {
    const todayEt = getTodayEtDate();
    const todayEspn = todayEt.replace(/-/g, "");
    const todayGames = await fetchGamesForDate("mlb", todayEspn);
    if (todayGames.length < 4) {
      res.status(400).json({ error: "Not enough games today — High Heat requires at least 4 MLB games. See you tomorrow!" });
      return;
    }
  }

  const resolvedSeason = season ?? new Date().getFullYear();

  const inviteCode = generateInviteCode();
  const [pool] = await db.insert(poolsTable).values({
    name,
    sport: sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa" | "worldcup" | "intl",
    poolType: resolvedPoolType,
    startWeek: startWeek ?? null,
    description: description ?? null,
    inviteCode,
    currentWeek: currentWeek ?? (resolvedPoolType === "mid_season" ? (startWeek ?? 1) : 1),
    season: resolvedSeason,
    isActive: true,
    commissionerId: req.user!.id,
    maxEntries: maxEntries ?? null,
    minEntries: minEntries ?? null,
    entryFee: entryFee ?? null,
    prizePot: resolvedPrizePot,
    prizeStructure: resolvedPrizeStructure,
    prizeMode,
    commissionerCut,
    showCommissionerCut,
    doubleElimination: doubleElimination === true,
    pickFrequency: resolvedPickFrequency,
    // isRecurring only meaningful for MLB daily; default true (matching DB default)
    // when the client does not send the field so new pools auto-advance by default.
    // Crazy 8's pools are always recurring — the daily/weekly competition never ends.
    isRecurring: resolvedPoolType === "crazy_8s" ? true : (typeof isRecurring === 'boolean' ? isRecurring : true),
    sandboxMode: sandboxMode === true,
  }).returning();

  await db.insert(entriesTable).values({ poolId: pool.id, userId: req.user!.id, status: "alive" });

  res.status(201).json(formatPool(pool, 1, 1, req.user!.username));
});

// POST /api/pools/join
router.post("/join", requireAuth, async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    res.status(400).json({ error: "inviteCode is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.inviteCode, inviteCode.toUpperCase())).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [existing] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, req.user!.id)))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Already a member of this pool" });
    return;
  }

  if (pool.maxEntries !== null) {
    const [{ currentCount }] = await db
      .select({ currentCount: count() })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, pool.id));
    if (Number(currentCount) >= pool.maxEntries) {
      res.status(409).json({ error: "This pool is full and cannot accept new members." });
      return;
    }
  }

  await db.insert(entriesTable).values({
    poolId: pool.id,
    userId: req.user!.id,
    status: "alive",
  });

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

  res.json(formatPool(pool, Number(total), Number(active), commissioner?.username ?? ""));
});

// GET /api/pools/invite/:inviteCode/preview  — public, no auth required
router.get("/invite/:inviteCode/preview", async (req, res) => {
  const inviteCode = String(req.params.inviteCode).toUpperCase();
  const [pool] = await db
    .select()
    .from(poolsTable)
    .where(eq(poolsTable.inviteCode, inviteCode))
    .limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const [{ playerCount }] = await db
    .select({ playerCount: count() })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, pool.id));
  res.json({
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    poolType: pool.poolType,
    pickFrequency: pool.pickFrequency,
    prizePot: pool.prizePot ?? null,
    prizeStructure: pool.prizeStructure ?? null,
    prizeMode: pool.prizeMode ?? "fixed",
    entryFee: pool.entryFee ?? null,
    minEntries: pool.minEntries ?? null,
    maxEntries: pool.maxEntries ?? null,
    playerCount: Number(playerCount),
    description: pool.description ?? null,
    season: pool.season ?? null,
    commissionerCut: pool.commissionerCut ?? 0,
    showCommissionerCut: pool.showCommissionerCut ?? false,
  });
});

// GET /api/pools/crazy-eights-mlb-check
// Returns today's MLB game count — used by CreatePool wizard before showing the create button.
// Must be registered before /:poolId so the literal path is not swallowed as a poolId.
router.get("/crazy-eights-mlb-check", requireAuth, async (_req, res) => {
  const todayEt = getTodayEtDate();
  const todayEspn = todayEt.replace(/-/g, "");
  const games = await fetchGamesForDate("mlb", todayEspn);
  const count = games.length;
  res.json({ count, sufficient: count >= 8 });
});

// GET /api/pools/:poolId
router.get("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const members = await db.select({
    userId: entriesTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    status: entriesTable.status,
    eliminatedWeek: entriesTable.eliminatedWeek,
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

  res.json({
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    poolType: pool.poolType,
    startWeek: pool.startWeek ?? null,
    description: pool.description,
    inviteCode: pool.inviteCode,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isActive: pool.isActive,
    commissionerId: pool.commissionerId,
    commissionerName: commissioner?.username ?? "",
    maxEntries: pool.maxEntries,
    minEntries: pool.minEntries ?? null,
    closureReason: pool.closureReason ?? null,
    endedAt: pool.endedAt?.toISOString() ?? null,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    prizeStructure: pool.prizeStructure ?? null,
    prizeMode: pool.prizeMode ?? "fixed",
    doubleElimination: pool.doubleElimination,
    pickFrequency: pool.pickFrequency,
    isRecurring: pool.isRecurring,
    sandboxMode: (pool as any).sandboxMode ?? false,
    sandboxWeek: (pool as any).sandboxWeek ?? 1,
    totalMembers: members.length,
    activeCount: members.filter(m => m.status === "alive").length,
    members: members.map(m => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    createdAt: pool.createdAt.toISOString(),
  });
});

// PATCH /api/pools/:poolId
router.patch("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const { name, description, maxEntries, minEntries, currentWeek, season, isActive, poolType, startWeek, doubleElimination, pickFrequency, isRecurring, sandboxMode } = req.body;

  const setEndedAt = isActive === false && pool.isActive ? { endedAt: new Date() } : {};

  const [updated] = await db.update(poolsTable).set({
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(maxEntries !== undefined && { maxEntries }),
    ...(minEntries !== undefined && { minEntries }),
    ...(currentWeek !== undefined && { currentWeek }),
    ...(season !== undefined && { season }),
    ...(isActive !== undefined && { isActive }),
    ...(poolType !== undefined && { poolType: poolType as "season" | "weekly" | "mid_season" | "pickem" | "group_stage_predictor" | "wc_bracket" }),
    ...(startWeek !== undefined && { startWeek }),
    ...(doubleElimination !== undefined && { doubleElimination: doubleElimination === true }),
    ...(pickFrequency !== undefined && { pickFrequency: pickFrequency as "weekly" | "daily" }),
    ...(typeof isRecurring === "boolean" && { isRecurring }),
    ...(typeof sandboxMode === "boolean" && { sandboxMode }),
    ...setEndedAt,
  }).where(eq(poolsTable.id, poolId)).returning();

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, updated.commissionerId));

  res.json(formatPool(updated, Number(total), Number(active), commissioner?.username ?? ""));
});

// PATCH /api/pools/:poolId/cancel — soft-cancel by commissioner if no other member has picked yet
router.patch("/:poolId/cancel", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  if (!pool.isActive) {
    res.status(409).json({ error: "Pool is already inactive." });
    return;
  }

  if (pool.isRecurring) {
    res.status(409).json({ error: "Recurring pools cannot be cancelled. Use 'End After This Cycle' from the commissioner panel instead." });
    return;
  }

  // Determine the correct picks table for this pool type and count non-commissioner picks
  const PICKEM_TYPES = new Set(["pickem", "crazy_8s", "nfl_confidence", "nfl_confidence_weekly", "pickem_season"]);
  const pt = pool.poolType as string;
  let hasOtherPicks = false;

  if (PICKEM_TYPES.has(pt)) {
    const [row] = await db
      .select({ n: count() })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), ne(pickemPicksTable.userId, pool.commissionerId)));
    hasOtherPicks = Number(row.n) > 0;
  } else if (pt === "wc_bracket") {
    const [row] = await db
      .select({ n: count() })
      .from(wcBracketPicksTable)
      .where(and(eq(wcBracketPicksTable.poolId, poolId), ne(wcBracketPicksTable.userId, pool.commissionerId)));
    hasOtherPicks = Number(row.n) > 0;
  } else if (pt === "nfl_division_predictor") {
    const [row] = await db
      .select({ n: count() })
      .from(nflDivisionPredictorPicksTable)
      .where(and(eq(nflDivisionPredictorPicksTable.poolId, poolId), ne(nflDivisionPredictorPicksTable.userId, pool.commissionerId)));
    hasOtherPicks = Number(row.n) > 0;
  } else if (pt === "group_stage_predictor") {
    const [row] = await db
      .select({ n: count() })
      .from(groupStagePredictorPicksTable)
      .where(and(eq(groupStagePredictorPicksTable.poolId, poolId), ne(groupStagePredictorPicksTable.userId, pool.commissionerId)));
    hasOtherPicks = Number(row.n) > 0;
  } else {
    // season, weekly, mid_season, dirty_dozen — survivor picks table
    const [row] = await db
      .select({ n: count() })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), ne(picksTable.userId, pool.commissionerId)));
    hasOtherPicks = Number(row.n) > 0;
  }

  if (hasOtherPicks) {
    res.status(409).json({ error: "Cannot cancel: other members have already submitted picks." });
    return;
  }

  const [updated] = await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date(), closureReason: "cancelled_by_commissioner" })
    .where(eq(poolsTable.id, poolId))
    .returning();

  res.json({ success: true, pool: updated });
});

// DELETE /api/pools/:poolId
router.delete("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));
  res.json({ success: true, message: "Pool deleted" });
});

// GET /api/pools/:poolId/stats
router.get("/:poolId/stats", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const totalNum = Number(total);
  const activeNum = Number(active);

  const thisWeekPicks = await db.select({ teamName: picksTable.teamName }).from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, pool.currentWeek)));

  const teamCounts: Record<string, number> = {};
  for (const p of thisWeekPicks) {
    teamCounts[p.teamName] = (teamCounts[p.teamName] ?? 0) + 1;
  }
  const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);

  res.json({
    poolId,
    totalMembers: totalNum,
    activeMembers: activeNum,
    eliminatedMembers: totalNum - activeNum,
    currentWeek: pool.currentWeek,
    weeklyPickRate: totalNum > 0 ? thisWeekPicks.length / totalNum : 0,
    mostPickedTeam: sortedTeams[0]?.[0] ?? null,
    mostPickedTeamCount: sortedTeams[0]?.[1] ?? null,
    survivorPercentage: totalNum > 0 ? (activeNum / totalNum) * 100 : 0,
  });
});

export default router;
