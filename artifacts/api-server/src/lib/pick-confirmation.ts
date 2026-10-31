import {
  createPickConfirmationNumber,
  sendPicksConfirmationEmail,
  type PickConfirmationItem,
  type PicksConfirmationEmailInput,
} from "./mailer";
import { db, pickConfirmationsTable, pickemPicksTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { NFL_TEAM_INFO } from "./nfl2025Schedule";
import {
  fetchGamesForDate,
  fetchNflGamesByWeek,
  fetchNhlGamesByWeek,
  fetchNbaGamesByWeek,
  getMlbWeekBounds,
} from "./espn";
import { fetchNbaSurvivorGamesByWeek, weekendGamesEt } from "./nba-survivor-slate";

export type PickConfirmationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ConfirmationGame {
  id: string;
  date: string;
  homeTeam: { id: string; displayName: string };
  awayTeam: { id: string; displayName: string };
}

export interface SubmittedConfirmationPick {
  gameId: string;
  pickedTeamId: string;
  pickedTeamName: string;
}

export interface PersistedPickConfirmation {
  confirmationNumber: string;
  submittedAt: Date;
  email: PicksConfirmationEmailInput;
}

export function makePickConfirmation(input: Omit<PicksConfirmationEmailInput, "confirmationNumber" | "submittedAt">): PersistedPickConfirmation {
  const submittedAt = new Date();
  return {
    confirmationNumber: createPickConfirmationNumber(),
    submittedAt,
    email: { ...input, confirmationNumber: "", submittedAt },
  };
}

export function confirmationDeliveryState(providerMessageId: string | null): {
  deliveryStatus: "sent"; providerMessageId: string | null; failureReason: null;
} {
  return { deliveryStatus: "sent", providerMessageId, failureReason: null };
}

export function failedConfirmationDeliveryState(error: unknown): {
  deliveryStatus: "failed"; providerMessageId: null; failureReason: string;
} {
  return {
    deliveryStatus: "failed",
    providerMessageId: null,
    failureReason: error instanceof Error ? error.message : String(error),
  };
}

/** Must be called using the transaction which writes the associated picks. */
export async function insertPickConfirmation(
  tx: PickConfirmationTransaction,
  data: PersistedPickConfirmation,
  context: { userId: number; poolId: number; poolType: string; sport: string; periodKey: string },
): Promise<void> {
  await tx.insert(pickConfirmationsTable).values({
    confirmationId: data.confirmationNumber,
    userId: context.userId,
    poolId: context.poolId,
    poolType: context.poolType,
    sport: context.sport,
    periodKey: context.periodKey,
    submittedAt: data.submittedAt,
    recipientEmail: data.email.toEmail,
    picksSnapshot: data.email.picks,
  });
}

/** Queue only after the surrounding transaction commits; it never reads mutable picks. */
export function deliverPickConfirmation(
  data: PersistedPickConfirmation,
  context: Record<string, unknown>,
  sender: (input: PicksConfirmationEmailInput) => Promise<string | null> = sendPicksConfirmationEmail,
): void {
  void (async () => {
    let providerMessageId: string | null;
    try {
      providerMessageId = await sender({ ...data.email, confirmationNumber: data.confirmationNumber });
    } catch (error) {
      try {
        await db.update(pickConfirmationsTable).set(failedConfirmationDeliveryState(error))
          .where(eq(pickConfirmationsTable.confirmationId, data.confirmationNumber));
      } catch (statusError) {
        logger.error(
          { err: statusError, deliveryError: error, ...context, confirmationNumber: data.confirmationNumber },
          "Pick confirmation delivery and status update failed",
        );
        return;
      }
      logger.error(
        { err: error, ...context, confirmationNumber: data.confirmationNumber },
        "Pick confirmation email failed",
      );
      return;
    }

    try {
      await db.update(pickConfirmationsTable).set(confirmationDeliveryState(providerMessageId))
        .where(eq(pickConfirmationsTable.confirmationId, data.confirmationNumber));
    } catch (statusError) {
      logger.error(
        { err: statusError, ...context, confirmationNumber: data.confirmationNumber, providerMessageId },
        "Pick confirmation was sent but its delivery status update failed",
      );
    }
  })();
}

export function isSharedPickConfirmationSport(sport: string): boolean {
  return sport === "mls" || sport === "superleague" || sport === "championsleague";
}

export function isThreeWayPickConfirmationSport(sport: string): boolean {
  return sport === "worldcup" || sport === "intl";
}

export function buildTeamPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game?.homeTeam.id === pick.pickedTeamId;
    const pickedIsAway = game?.awayTeam.id === pick.pickedTeamId;
    const teamDisplay = pickedIsHome
      ? game.homeTeam.displayName
      : pickedIsAway
        ? game.awayTeam.displayName
        : pick.pickedTeamName;
    const customLabel = pick.pickedTeamName?.trim();
    const selection = customLabel && (pickedIsHome || pickedIsAway) && /[+-]\d/.test(customLabel)
      ? customLabel
      : teamDisplay;
    const opponent = pickedIsHome
      ? game?.awayTeam.displayName
      : pickedIsAway
        ? game?.homeTeam.displayName
        : null;
    return {
      selection,
      matchup: opponent ? `${selection} vs. ${opponent}` : null,
      gameTime: game?.date ?? null,
    };
  });
}

export function buildConfidenceTeamPickConfirmationItems(
  picks: Array<SubmittedConfirmationPick & { confidencePoints?: number | null }>,
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  return buildTeamPickConfirmationItems(picks, games).map((item, index) => {
    const confidence = picks[index]?.confidencePoints;
    if (confidence == null) return item;
    return { ...item, selection: `${item.selection} (${confidence} pts)` };
  });
}

export function buildStandingOrderPickConfirmationItems(
  groups: Array<{ label: string; positions: string[] }>,
): PickConfirmationItem[] {
  return groups.map((group) => ({
    selection: `${group.label}: ${group.positions.map((team, index) => `${index + 1}. ${team}`).join(", ")}`,
    matchup: null,
    gameTime: null,
  }));
}

export function buildLabeledPickConfirmationItems(
  items: Array<{ selection: string; matchup?: string | null; gameTime?: string | null }>,
): PickConfirmationItem[] {
  return items.map((item) => ({
    selection: item.selection,
    matchup: item.matchup ?? null,
    gameTime: item.gameTime ?? null,
  }));
}

export function buildThreeWayPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const selection = pick.pickedTeamId === "draw"
      ? "Draw"
      : pick.pickedTeamId === "home_win"
        ? `${game?.homeTeam.displayName ?? "Home team"} win`
        : pick.pickedTeamId === "away_win"
          ? `${game?.awayTeam.displayName ?? "Away team"} win`
          : pick.pickedTeamName;
    return {
      selection,
      matchup: game
        ? `${game.awayTeam.displayName} at ${game.homeTeam.displayName}`
        : null,
      gameTime: game?.date ?? null,
    };
  });
}

type PickemConfirmationPool = {
  id: number;
  name: string;
  poolType: string;
  sport: string;
  currentWeek: number;
};

type PickemConfirmationUser = { id: number; email: string; username: string };

async function currentPickemWeekPicks(
  tx: PickConfirmationTransaction,
  poolId: number,
  userId: number,
  week: number,
) {
  return tx.select({
    gameId: pickemPicksTable.gameId,
    pickedTeamId: pickemPicksTable.pickedTeamId,
    pickedTeamName: pickemPicksTable.pickedTeamName,
    confidencePoints: pickemPicksTable.confidencePoints,
  }).from(pickemPicksTable).where(and(
    eq(pickemPicksTable.poolId, poolId),
    eq(pickemPicksTable.userId, userId),
    eq(pickemPicksTable.week, week),
  ));
}

/** Full-period team pick'em receipt after upserts (NFL office, daily MLB, etc.). */
export async function persistTeamPickemWeekConfirmation(
  tx: PickConfirmationTransaction,
  pool: PickemConfirmationPool,
  user: PickemConfirmationUser,
  input: {
    week: number;
    games: ConfirmationGame[];
    periodKey: string;
    gameIds?: Set<string>;
    normalizeNflTeamIds?: boolean;
  },
): Promise<PersistedPickConfirmation> {
  const currentPicks = await currentPickemWeekPicks(tx, pool.id, user.id, input.week);
  const periodPicks = input.gameIds
    ? currentPicks.filter((pick) => input.gameIds!.has(pick.gameId))
    : currentPicks;
  const submittedPicks = periodPicks.map((pick) => ({
    gameId: pick.gameId,
    pickedTeamId: input.normalizeNflTeamIds
      ? (NFL_TEAM_INFO[pick.pickedTeamId]?.id ?? pick.pickedTeamId)
      : pick.pickedTeamId,
    pickedTeamName: pick.pickedTeamName,
  }));
  const confirmation = makePickConfirmation({
    toEmail: user.email,
    username: user.username,
    poolName: pool.name,
    picks: buildTeamPickConfirmationItems(submittedPicks, input.games),
  });
  await insertPickConfirmation(tx, confirmation, {
    userId: user.id,
    poolId: pool.id,
    poolType: String(pool.poolType),
    sport: String(pool.sport),
    periodKey: input.periodKey,
  });
  return confirmation;
}

/** World Cup / intl 3-way pick'em receipt for the active pick period. */
export async function persistThreeWayPickemConfirmation(
  tx: PickConfirmationTransaction,
  pool: PickemConfirmationPool,
  user: PickemConfirmationUser,
  input: { week: number; games: ConfirmationGame[]; periodKey: string; gameIds?: Set<string> },
): Promise<PersistedPickConfirmation> {
  const currentPicks = await currentPickemWeekPicks(tx, pool.id, user.id, input.week);
  const periodPicks = input.gameIds
    ? currentPicks.filter((pick) => input.gameIds!.has(pick.gameId))
    : currentPicks;
  const confirmation = makePickConfirmation({
    toEmail: user.email,
    username: user.username,
    poolName: pool.name,
    picks: buildThreeWayPickConfirmationItems(periodPicks, input.games),
  });
  await insertPickConfirmation(tx, confirmation, {
    userId: user.id,
    poolId: pool.id,
    poolType: String(pool.poolType),
    sport: String(pool.sport),
    periodKey: input.periodKey,
  });
  return confirmation;
}

/** NFL confidence-style receipt with confidence points on each line. */
export async function persistConfidencePickemWeekConfirmation(
  tx: PickConfirmationTransaction,
  pool: PickemConfirmationPool,
  user: PickemConfirmationUser,
  input: { week: number; games: ConfirmationGame[]; periodKey: string },
): Promise<PersistedPickConfirmation> {
  const currentPicks = await currentPickemWeekPicks(tx, pool.id, user.id, input.week);
  const submittedPicks = currentPicks.map((pick) => ({
    gameId: pick.gameId,
    pickedTeamId: NFL_TEAM_INFO[pick.pickedTeamId]?.id ?? pick.pickedTeamId,
    pickedTeamName: pick.pickedTeamName,
    confidencePoints: pick.confidencePoints,
  }));
  const confirmation = makePickConfirmation({
    toEmail: user.email,
    username: user.username,
    poolName: pool.name,
    picks: buildConfidenceTeamPickConfirmationItems(submittedPicks, input.games),
  });
  await insertPickConfirmation(tx, confirmation, {
    userId: user.id,
    poolId: pool.id,
    poolType: String(pool.poolType),
    sport: String(pool.sport),
    periodKey: input.periodKey,
  });
  return confirmation;
}

export async function resolveSurvivorConfirmationGame(
  pool: {
    sport: string;
    poolType: string;
    season: number;
    isPreseason?: boolean | null;
    createdAt: Date;
    initialPeriodStart?: string | null;
    pickFrequency?: string | null;
  },
  week: number,
  teamId: string,
  pickDate?: string | null,
): Promise<ConfirmationGame | null> {
  const sport = String(pool.sport);
  if (sport === "nfl") {
    const games = await fetchNflGamesByWeek(week, pool.season, pool.isPreseason ? 1 : 2);
    return games.find((game) => game.homeTeam.id === teamId || game.awayTeam.id === teamId) ?? null;
  }
  if (sport === "nba") {
    const games = pool.poolType === "season"
      ? weekendGamesEt(await fetchNbaSurvivorGamesByWeek(pool.createdAt, week))
      : await fetchNbaGamesByWeek(pool.createdAt, week);
    return games.find((game) => game.homeTeam.id === teamId || game.awayTeam.id === teamId) ?? null;
  }
  if (sport === "nhl") {
    const games = await fetchNhlGamesByWeek(
      pool.createdAt,
      week,
      pool.isPreseason ? 1 : 2,
      pool.initialPeriodStart,
    );
    return games.find((game) => game.homeTeam.id === teamId || game.awayTeam.id === teamId) ?? null;
  }
  if (sport === "mlb") {
    if (pool.pickFrequency === "daily" && pickDate) {
      const games = await fetchGamesForDate("mlb", pickDate.replace(/-/g, ""));
      return games.find((game) => game.homeTeam.id === teamId || game.awayTeam.id === teamId) ?? null;
    }
    const { espnDates } = getMlbWeekBounds(pool.createdAt, week);
    const dayGames = await Promise.all(espnDates.map((date) => fetchGamesForDate("mlb", date)));
    const games = dayGames.flat();
    return games.find((game) => game.homeTeam.id === teamId || game.awayTeam.id === teamId) ?? null;
  }
  return null;
}

export async function sendPicksConfirmationSafely(
  input: PicksConfirmationEmailInput,
  onError: (error: unknown) => void,
  sender: (input: PicksConfirmationEmailInput) => Promise<unknown> = sendPicksConfirmationEmail,
): Promise<void> {
  try {
    await sender(input);
  } catch (error) {
    onError(error);
  }
}