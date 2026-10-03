import {
  fetchGamesForDateChecked,
  formatCalendarDateEt,
  getNhlWeekBounds,
  type EspnGame,
} from "./espn";

export type NhlSaturdayScheduleFetcher = (date: string) => Promise<EspnGame[] | null>;

export type NhlPoolPeriodResolution =
  | { ok: true; initialPeriodStart: string }
  | { ok: false; status: 503; error: string; retryable: true };

const NHL_SCHEDULE_UNAVAILABLE =
  "Unable to verify the NHL Saturday schedule right now. Please retry creating the pool.";

export function shouldResolveNhlPoolInitialPeriod(input: {
  sport: string;
  poolType: string;
  pickFrequency: string;
  sandboxMode: boolean;
}): boolean {
  return input.sport === "nhl"
    && !input.sandboxMode
    && (
      input.poolType === "season"
      || input.poolType === "crazy_8s"
      || (input.poolType === "pickem" && input.pickFrequency === "weekly")
    );
}

function addEtCalendarDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + amount)).toISOString().slice(0, 10);
}

function currentEtWeekMonday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const dateOnly = new Date(Date.UTC(year!, month! - 1, day!));
  const daysSinceMonday = (dateOnly.getUTCDay() + 6) % 7;
  return addEtCalendarDays(date, -daysSinceMonday);
}

/**
 * Resolve Week 1 for a new live NHL pool. An empty Saturday slate falls back
 * to the legacy createdAt-based Monday; an unavailable slate fails closed.
 */
export async function resolveNhlPoolInitialPeriodStart(
  creationInstant: Date,
  fetchSaturdayGames: NhlSaturdayScheduleFetcher = (date) =>
    fetchGamesForDateChecked("nhl", date, 2, true),
): Promise<NhlPoolPeriodResolution> {
  const todayEt = formatCalendarDateEt(creationInstant);
  const currentMonday = currentEtWeekMonday(todayEt);
  const saturday = addEtCalendarDays(currentMonday, 5);

  let saturdayGames: EspnGame[] | null;
  try {
    saturdayGames = await fetchSaturdayGames(saturday.replace(/-/g, ""));
  } catch {
    return {
      ok: false,
      status: 503,
      error: NHL_SCHEDULE_UNAVAILABLE,
      retryable: true,
    };
  }
  if (saturdayGames === null) {
    return {
      ok: false,
      status: 503,
      error: NHL_SCHEDULE_UNAVAILABLE,
      retryable: true,
    };
  }

  const regularSeasonGames = saturdayGames.filter((game) => game.seasonType === 2);
  if (regularSeasonGames.length > 0) {
    const startTimes = regularSeasonGames.map((game) => new Date(game.date).getTime());
    if (startTimes.some((startTime) => !Number.isFinite(startTime))) {
      return {
        ok: false,
        status: 503,
        error: NHL_SCHEDULE_UNAVAILABLE,
        retryable: true,
      };
    }
    const earliestStart = Math.min(...startTimes);
    if (earliestStart > creationInstant.getTime()) {
      return { ok: true, initialPeriodStart: currentMonday };
    }
  }

  // Use the existing resolver itself for the fallback so its behavior remains
  // exactly aligned with the legacy Week 1 bounds, including its ET date rules.
  const legacyMonday = getNhlWeekBounds(creationInstant, 1).weekStart;
  return { ok: true, initialPeriodStart: formatCalendarDateEt(legacyMonday) };
}