import {
  resolveCurrentChampionsLeagueSlate,
  type ChampionsLeagueSlate,
  type EspnGame,
} from "./espn";
import { calcPrize } from "./prizeCalc";

type PrizeStructure = Array<{ place: number; amount: number }> | null | undefined;

export interface ChampionsLeagueClosurePlanEntry {
  userIds: number[];
  finishPosition: number;
  finalWinner: boolean;
  prizeAmount: number | null;
}

/**
 * A completed explicit Final is the only terminal Champions League period.
 * Absence of future fixtures is deliberately not considered terminal because
 * ESPN schedule gaps and off-season windows can look identical.
 */
export function resolveTerminalChampionsLeagueSlate(
  games: EspnGame[],
  now = new Date(),
): ChampionsLeagueSlate | null {
  const slate = resolveCurrentChampionsLeagueSlate(games, now);
  if (
    !slate
    || slate.phaseSlug !== "final"
    || slate.legNumber != null
    || slate.games.length !== 1
  ) {
    return null;
  }

  const final = slate.games[0]!;
  if (
    final.phaseSlug !== "final"
    || final.championsLeaguePhaseSource !== "season_slug"
    || final.legNumber != null
    || final.status !== "final"
    || !final.isCompleted
    || final.homeScore == null
    || final.awayScore == null
  ) {
    return null;
  }

  return slate;
}

export function championsLeagueGameMatchesPoolSeason(
  game: EspnGame,
  pool: { season: number; createdAt: Date },
): boolean {
  if (game.seasonYear == null) return false;

  const gameDate = new Date(game.date);
  const createdAt = new Date(pool.createdAt);
  if (
    !Number.isFinite(gameDate.getTime())
    || !Number.isFinite(createdAt.getTime())
    || createdAt.getTime() > gameDate.getTime()
  ) {
    return false;
  }

  return game.seasonYear === pool.season
    || game.seasonYear === pool.season - 1;
}

export function resolveTerminalChampionsLeagueSlateForPool(
  games: EspnGame[],
  pool: { season: number; createdAt: Date },
  now = new Date(),
): ChampionsLeagueSlate | null {
  const matching = games.filter((game) =>
    championsLeagueGameMatchesPoolSeason(game, pool)
  );

  // A calendar-year default on a pool created before the spring Final can
  // represent the season that began the prior year. Prefer that completed
  // prior-season Final when it exists; otherwise target pool.season directly.
  const previousSeason = resolveTerminalChampionsLeagueSlate(
    matching.filter((game) => game.seasonYear === pool.season - 1),
    now,
  );
  if (previousSeason) return previousSeason;

  return resolveTerminalChampionsLeagueSlate(
    matching.filter((game) => game.seasonYear === pool.season),
    now,
  );
}

export function buildChampionsLeagueClosurePlan(
  standings: Array<{ userId: number; correct: number }>,
  prize: {
    prizeStructure: PrizeStructure;
    prizeMode: string | null | undefined;
    entryFee: number | null | undefined;
    prizePot: number | null | undefined;
    maxEntries: number | null | undefined;
  },
): ChampionsLeagueClosurePlanEntry[] {
  const ordered = [...standings].sort((a, b) => b.correct - a.correct || a.userId - b.userId);
  const plan: ChampionsLeagueClosurePlanEntry[] = [];
  let placeIndex = 0;
  let finishPosition = 1;

  while (placeIndex < ordered.length) {
    const score = ordered[placeIndex]!.correct;
    const group = ordered.slice(placeIndex).filter((row) => row.correct === score);
    const prizeAmount = calcPrize({
      ...prize,
      totalEntries: ordered.length,
      placeIndex,
      coWinners: group.length,
    });

    plan.push({
      userIds: group.map((row) => row.userId),
      finishPosition,
      finalWinner: finishPosition === 1,
      prizeAmount,
    });

    placeIndex += group.length;
    finishPosition += 1;
  }

  return plan;
}