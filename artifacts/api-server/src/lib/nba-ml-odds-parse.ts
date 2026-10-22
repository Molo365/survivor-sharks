export type NbaMoneylinePair = {
  homeDecimalOdds: number;
  awayDecimalOdds: number;
};

/** American moneyline → decimal odds (e.g. -165 → 1.606, +140 → 2.4). */
export function americanMoneylineToDecimal(ml: number): number | null {
  if (!Number.isFinite(ml) || ml === 0) return null;
  if (ml > 0) return 1 + ml / 100;
  return 1 + 100 / Math.abs(ml);
}

export function parseEspnNbaMoneylines(
  pickcenter: unknown,
  homeTeamId: string,
  awayTeamId: string,
): NbaMoneylinePair | null {
  if (!pickcenter || typeof pickcenter !== "object") return null;
  const pc = pickcenter as {
    homeTeamOdds?: { moneyLine?: number; teamId?: string };
    awayTeamOdds?: { moneyLine?: number; teamId?: string };
  };
  const homeMl = Number(pc.homeTeamOdds?.moneyLine);
  const awayMl = Number(pc.awayTeamOdds?.moneyLine);
  const homeDecimal = americanMoneylineToDecimal(homeMl);
  const awayDecimal = americanMoneylineToDecimal(awayMl);
  if (homeDecimal == null || awayDecimal == null) return null;
  const homeId = String(pc.homeTeamOdds?.teamId ?? homeTeamId);
  const awayId = String(pc.awayTeamOdds?.teamId ?? awayTeamId);
  if (homeId !== homeTeamId && homeId !== awayTeamId) {
    // ESPN team ids should match slate; still store by requested home/away.
  }
  if (awayId !== awayTeamId && awayId !== homeTeamId) {
    // same
  }
  return { homeDecimalOdds: homeDecimal, awayDecimalOdds: awayDecimal };
}
