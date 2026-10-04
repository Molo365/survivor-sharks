import { getMlbPostseasonField, type MlbField } from "./mlb-bracket";
import { getMlbBracketPlayoffStartState } from "./mlb-bracket-lock";
import { detectMlbRegularSeasonEnd } from "./mlb-season-boundary";

export interface MlbPoolCreationValidationInput {
  sport: string;
  poolType: string;
  sandboxMode: boolean;
  season: number;
  detectSeasonEnd?: (season: number) => Promise<boolean>;
}

export type MlbPoolCreationValidationResult =
  | { ok: true; mlbPostseasonField: MlbField | null }
  | { ok: false; status: 400 | 503; error: string };

const MLB_REGULAR_SEASON_OVER =
  "The MLB regular season is over. New Pick-Em and High Heat pools can't be created until next season — use Sandbox to test.";

export async function validateMlbPoolCreation({
  sport,
  poolType,
  sandboxMode,
  season,
  detectSeasonEnd = detectMlbRegularSeasonEnd,
}: MlbPoolCreationValidationInput): Promise<MlbPoolCreationValidationResult> {
  if (sport !== "mlb") return { ok: true, mlbPostseasonField: null };
  if (sandboxMode) return { ok: true, mlbPostseasonField: null };

  if (poolType === "pickem" || poolType === "crazy_8s") {
    try {
      if (await detectSeasonEnd(season)) {
        return { ok: false, status: 400, error: MLB_REGULAR_SEASON_OVER };
      }
    } catch {
      return {
        ok: false,
        status: 503,
        error: "Unable to verify the MLB schedule right now. Please try again.",
      };
    }
    return { ok: true, mlbPostseasonField: null };
  }

  if (poolType === "mlb_bracket") {
    const mlbPostseasonField = await getMlbPostseasonField(season);
    if (!mlbPostseasonField) {
      return { ok: false, status: 400, error: "Bracket opens once the playoff field is set" };
    }
    const playoffStart = await getMlbBracketPlayoffStartState(season);
    if (playoffStart === "unavailable") {
      return {
        ok: false,
        status: 503,
        error: "Unable to verify the MLB playoff schedule right now. Please try again.",
      };
    }
    if (playoffStart === "started") {
      return {
        ok: false,
        status: 400,
        error: "The MLB postseason bracket has already begun. New pools must be created before the first Wild Card game.",
      };
    }
    return { ok: true, mlbPostseasonField };
  }

  return { ok: true, mlbPostseasonField: null };
}
