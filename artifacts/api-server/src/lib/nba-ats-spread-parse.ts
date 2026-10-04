export interface NbaAtsSpreadLine {
  spread: number;
  favoriteTeamId: string;
}

/** Store absolute half-point lines only — no whole numbers, no pushes. */
export function normalizeNbaAtsSpread(raw: number): number | null {
  if (!Number.isFinite(raw) || raw === 0) return null;
  const abs = Math.abs(raw);
  if (Number.isInteger(abs)) return abs + 0.5;
  return abs;
}

export function parseEspnNbaSpread(
  pickcenter: any,
  homeTeamId: string,
  awayTeamId: string,
): NbaAtsSpreadLine | null {
  if (!pickcenter || typeof pickcenter !== "object") return null;
  const spread = normalizeNbaAtsSpread(Number(pickcenter.spread));
  if (spread == null) return null;

  const homeFav = pickcenter.homeTeamOdds?.favorite === true;
  const awayFav = pickcenter.awayTeamOdds?.favorite === true;
  let favoriteTeamId: string | null = null;
  if (homeFav && !awayFav) favoriteTeamId = String(pickcenter.homeTeamOdds?.teamId ?? homeTeamId);
  else if (awayFav && !homeFav) favoriteTeamId = String(pickcenter.awayTeamOdds?.teamId ?? awayTeamId);
  if (!favoriteTeamId) return null;
  return { spread, favoriteTeamId };
}
