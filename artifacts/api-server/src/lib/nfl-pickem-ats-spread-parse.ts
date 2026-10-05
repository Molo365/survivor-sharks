import { normalizeNbaAtsSpread } from "./nba-ats-spread-parse";

export interface NflPickemAtsSpreadLine {
  spread: number;
  favoriteTeamId: string;
}

/** Same half-point rule as NBA ATS (integer lines → +0.5). */
export const normalizeNflPickemAtsSpread = normalizeNbaAtsSpread;

export function parseEspnNflSpread(
  pickcenter: unknown,
  homeTeamId: string,
  awayTeamId: string,
): NflPickemAtsSpreadLine | null {
  if (!pickcenter || typeof pickcenter !== "object") return null;
  const pc = pickcenter as Record<string, unknown>;
  const spread = normalizeNflPickemAtsSpread(Number(pc.spread));
  if (spread == null) return null;

  const homeOdds = pc.homeTeamOdds as { favorite?: boolean; teamId?: string } | undefined;
  const awayOdds = pc.awayTeamOdds as { favorite?: boolean; teamId?: string } | undefined;
  const homeFav = homeOdds?.favorite === true;
  const awayFav = awayOdds?.favorite === true;
  let favoriteTeamId: string | null = null;
  if (homeFav && !awayFav) favoriteTeamId = String(homeOdds?.teamId ?? homeTeamId);
  else if (awayFav && !homeFav) favoriteTeamId = String(awayOdds?.teamId ?? awayTeamId);
  if (!favoriteTeamId) return null;
  return { spread, favoriteTeamId };
}
