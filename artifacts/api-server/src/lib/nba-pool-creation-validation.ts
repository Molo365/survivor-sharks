import {
  fetchGamesForDateChecked,
  getNbaWeekBounds,
  type EspnGame,
} from "./espn";

type CheckedScheduleFetcher = (
  sport: string,
  dateStr: string,
  seasonType?: number,
  requireEventsArray?: boolean,
  limit?: number,
) => Promise<EspnGame[] | null>;

export interface NbaPoolCreationValidationInput {
  sport: string;
  poolType: string;
  sandboxMode: boolean;
  createdAt: Date;
  fetchChecked?: CheckedScheduleFetcher;
}

export interface NbaPoolCreationValidationError {
  status: 400 | 503;
  error: string;
}

const NBA_PICKEM_UNSUPPORTED = "NBA Pick-Ems are not supported.";
const NBA_SCHEDULE_UNAVAILABLE =
  "Unable to verify the NBA schedule right now. Please retry creating the pool.";
const NBA_REGULAR_SEASON_NOT_OPEN =
  "NBA pools can be created once the regular season is within the week ahead.";

export async function validateNbaPoolCreation({
  sport,
  poolType,
  sandboxMode,
  createdAt,
  fetchChecked = fetchGamesForDateChecked,
}: NbaPoolCreationValidationInput): Promise<NbaPoolCreationValidationError | null> {
  if (sport !== "nba") return null;
  if (poolType === "pickem") {
    return { status: 400, error: NBA_PICKEM_UNSUPPORTED };
  }
  if (sandboxMode) return null;

  const { espnDates } = getNbaWeekBounds(createdAt, 1);
  let schedules: Array<EspnGame[] | null>;
  try {
    schedules = await Promise.all(
      espnDates.map((date) => fetchChecked("nba", date, 2, true)),
    );
  } catch {
    return { status: 503, error: NBA_SCHEDULE_UNAVAILABLE };
  }

  if (schedules.some((games) => games === null)) {
    return { status: 503, error: NBA_SCHEDULE_UNAVAILABLE };
  }

  const hasRegularSeasonGames = schedules
    .flatMap((games) => games ?? [])
    .some((game) => game.seasonType === 2);
  if (!hasRegularSeasonGames) {
    return { status: 400, error: NBA_REGULAR_SEASON_NOT_OPEN };
  }

  return null;
}