export const WEEKLY_BONUS_RESERVE_WEEKS = 18;

export function resolveSeasonPrizePot(opts: {
  entryFee: number;
  memberCount: number;
  weeklyBonusEnabled: boolean;
  weeklyBonusAmount: number | null | undefined;
  weeklyThresholdMet: boolean;
  weeks?: number;
}): { collected: number; weeklyReserveMax: number; seasonPot: number } {
  const weeks = opts.weeks ?? WEEKLY_BONUS_RESERVE_WEEKS;
  const collected = Math.max(0, opts.entryFee * opts.memberCount);
  if (
    !opts.weeklyBonusEnabled ||
    !opts.weeklyThresholdMet ||
    opts.weeklyBonusAmount == null ||
    opts.weeklyBonusAmount <= 0
  ) {
    return { collected, weeklyReserveMax: 0, seasonPot: collected };
  }
  const weeklyReserveMax = Number(opts.weeklyBonusAmount) * weeks;
  const seasonPot = Math.max(0, collected - weeklyReserveMax);
  return { collected, weeklyReserveMax, seasonPot };
}
