/** Matches NFL regular-season weeks used in create-pool reserve guidance. */
export const WEEKLY_BONUS_RESERVE_WEEKS = 18;

/** Same rounding as season pct → dollars in calculatePayouts. */
export function roundPayoutToNearestFive(dollars: number): number {
  return Math.round(dollars / 5) * 5;
}

export function weeklyPayoutFromPercent(entryFee: number, percent: number): number {
  if (entryFee <= 0 || percent <= 0) return 0;
  return roundPayoutToNearestFive((percent / 100) * entryFee);
}

export function deriveWeeklyBonusMinPlayers(
  entryFee: number,
  weeklyAmount: number,
  weeks = WEEKLY_BONUS_RESERVE_WEEKS,
): number {
  if (entryFee <= 0 || weeklyAmount <= 0) return 1;
  return Math.max(1, Math.ceil((weeklyAmount * weeks) / entryFee));
}

export function weeklyPercentFromAmount(entryFee: number, weeklyAmount: number): number | null {
  if (entryFee <= 0 || weeklyAmount <= 0) return null;
  return Math.round((weeklyAmount / entryFee) * 1000) / 10;
}

export type WeeklyBonusScenario = {
  label: string;
  playerCount: number;
  collected: number;
  weeklyPerWeek: number;
  weeklyEnabled: boolean;
  maxWeeklySeasonCost: number;
  seasonPotGuidance: number;
};

export function buildWeeklyBonusScenarios(opts: {
  entryFee: number;
  weeklyPercent: number;
  weeks?: number;
  examplePlayerCount?: number;
}): {
  weeklyPerWeek: number;
  minPlayers: number;
  weeklyPercent: number;
  scenarios: WeeklyBonusScenario[];
} {
  const weeks = opts.weeks ?? WEEKLY_BONUS_RESERVE_WEEKS;
  const weeklyPerWeek = weeklyPayoutFromPercent(opts.entryFee, opts.weeklyPercent);
  const minPlayers = deriveWeeklyBonusMinPlayers(opts.entryFee, weeklyPerWeek, weeks);
  const belowCount = Math.max(1, minPlayers - 1);

  const scenarios: WeeklyBonusScenario[] = [
    {
      label: `Below threshold (${belowCount} player${belowCount === 1 ? "" : "s"})`,
      playerCount: belowCount,
      collected: belowCount * opts.entryFee,
      weeklyPerWeek: 0,
      weeklyEnabled: false,
      maxWeeklySeasonCost: 0,
      seasonPotGuidance: belowCount * opts.entryFee,
    },
    {
      label: `Threshold met (${minPlayers} players)`,
      playerCount: minPlayers,
      collected: minPlayers * opts.entryFee,
      weeklyPerWeek,
      weeklyEnabled: true,
      maxWeeklySeasonCost: weeklyPerWeek * weeks,
      seasonPotGuidance: minPlayers * opts.entryFee - weeklyPerWeek * weeks,
    },
  ];

  const example = opts.examplePlayerCount ?? 50;
  if (opts.entryFee > 0 && weeklyPerWeek > 0 && example > minPlayers) {
    scenarios.push({
      label: `Example: ${example} players`,
      playerCount: example,
      collected: example * opts.entryFee,
      weeklyPerWeek,
      weeklyEnabled: true,
      maxWeeklySeasonCost: weeklyPerWeek * weeks,
      seasonPotGuidance: example * opts.entryFee - weeklyPerWeek * weeks,
    });
  }

  return {
    weeklyPerWeek,
    minPlayers,
    weeklyPercent: opts.weeklyPercent,
    scenarios,
  };
}
