import { resolveSeasonPrizePot, WEEKLY_BONUS_RESERVE_WEEKS } from "@/lib/weeklyBonusWizard";

export type WeeklyPickEmPayoutModel = "period_pot" | "season_budget";

export const WEEKLY_PICK_EM_PAYOUT_MODEL_OPTIONS: {
  value: WeeklyPickEmPayoutModel;
  title: string;
  description: string;
}[] = [
  {
    value: "period_pot",
    title: "This period's pot",
    description:
      "Each week or period pays from that period's entries (entry fee × players). Best default for most weekly pick'em pools.",
  },
  {
    value: "season_budget",
    title: "Season buy-in, one pot",
    description:
      "One season entry fee per player. Optional fixed weekly prizes come from the same pot; season-end prizes use what's left.",
  },
];

/** Weekly pick'em create flow — not NFL season survivor / pickem_season (separate weekly-bonus path). */
export function isWeeklyPickEmPayoutModelChoiceEligible(opts: {
  sport: string | undefined;
  poolType: string | undefined;
  pickFrequency: string | undefined;
  isRecurring: boolean | undefined;
}): boolean {
  const { sport, poolType, pickFrequency, isRecurring } = opts;
  if (!sport || !poolType || pickFrequency !== "weekly") return false;
  if (
    sport === "nfl" &&
    (poolType === "pickem_season" || poolType === "nfl_confidence" || poolType === "season")
  ) {
    return false;
  }
  if (poolType === "pickem" && ["mlb", "nhl", "mls", "superleague"].includes(sport)) {
    return isRecurring === true;
  }
  return false;
}

/** Existing NHL fixed-$ weekly bonus UI — only under season-budget model. */
export function isNhlSeasonBudgetWeeklyBonusEligible(opts: {
  sport: string | undefined;
  poolType: string | undefined;
  pickFrequency: string | undefined;
  isRecurring: boolean | undefined;
  payoutModel: WeeklyPickEmPayoutModel;
}): boolean {
  if (opts.payoutModel !== "season_budget") return false;
  return (
    opts.sport === "nhl" &&
    opts.poolType === "pickem" &&
    opts.pickFrequency === "weekly" &&
    opts.isRecurring === true
  );
}

export function inferWeeklyPickEmPayoutModelFromPool(pool: {
  sport: string;
  poolType: string;
  pickFrequency?: string | null;
  isRecurring?: boolean | null;
  weeklyBonusEnabled?: boolean | null;
}): WeeklyPickEmPayoutModel | null {
  if (
    !isWeeklyPickEmPayoutModelChoiceEligible({
      sport: pool.sport,
      poolType: pool.poolType as string,
      pickFrequency: pool.pickFrequency ?? "weekly",
      isRecurring: pool.isRecurring === true,
    })
  ) {
    return null;
  }
  return pool.weeklyBonusEnabled === true ? "season_budget" : "period_pot";
}

export function periodPotDollars(entryFee: number, playerCount: number): number {
  return Math.max(0, Math.round(entryFee) * playerCount);
}

/** Prize-step and review examples: which dollar pot season-end % applies to. */
export function prizeExamplePot(opts: {
  entryFee: number;
  playerCount: number;
  payoutModel: WeeklyPickEmPayoutModel;
  weeklyBonusEnabled: boolean;
  weeklyBonusAmount: number;
  weeklyBonusMinPlayers: number;
  /** NFL season weekly bonus uses percent path but same season-pot math when enabled. */
  nflSeasonWeeklyBonus?: boolean;
  weeks?: number;
}): { dollars: number; label: string; sublabel?: string } {
  const fee = Math.round(opts.entryFee);
  const count = Math.max(0, opts.playerCount);
  const collected = periodPotDollars(fee, count);

  const useSeasonBudgetMath =
    opts.payoutModel === "season_budget" ||
    opts.nflSeasonWeeklyBonus === true;

  if (useSeasonBudgetMath && opts.weeklyBonusEnabled && opts.weeklyBonusAmount > 0) {
    const thresholdMet = count >= opts.weeklyBonusMinPlayers;
    const { seasonPot } = resolveSeasonPrizePot({
      entryFee: fee,
      memberCount: count,
      weeklyBonusEnabled: true,
      weeklyBonusAmount: opts.weeklyBonusAmount,
      weeklyThresholdMet: thresholdMet,
      weeks: opts.weeks ?? WEEKLY_BONUS_RESERVE_WEEKS,
    });
    if (thresholdMet) {
      return {
        dollars: seasonPot,
        label: "Season-end pot",
        sublabel: "After reserving weekly prizes from the season buy-in",
      };
    }
    return {
      dollars: collected,
      label: "Season buy-in collected",
      sublabel: "Weekly prizes stay off until enough players join",
    };
  }

  if (opts.payoutModel === "season_budget") {
    return {
      dollars: collected,
      label: "Season buy-in collected",
      sublabel: "Set weekly prizes above to see season-end pot guidance",
    };
  }

  return {
    dollars: collected,
    label: "This period's pot",
    sublabel: "Entry fee × players for this period",
  };
}
