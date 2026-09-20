export interface PoolRulesSection {
  heading: string;
  items: string[];
}

export interface PoolRules {
  title: string;
  sections: PoolRulesSection[];
}

export interface PoolRulesPool {
  poolType?: string | null;
  sport?: string | null;
  prizeStructure?: Array<{ place: number; amount: number }> | null;
  prizeMode?: string | null;
  commissionerCut?: number | null;
  entryFee?: number | null;
  weeklyBonusEnabled?: boolean | null;
  weeklyBonusAmount?: number | string | null;
  weeklyBonusMinPlayers?: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function prizeItems(pool: PoolRulesPool): string[] {
  const items: string[] = [];
  const entryFee = pool.entryFee == null ? null : Number(pool.entryFee);
  if (entryFee != null && Number.isFinite(entryFee)) {
    items.push(`Entry fee: ${formatCurrency(entryFee)} per player.`);
  }

  const shares = pool.prizeStructure?.filter(
    (prize) => Number.isFinite(prize.place) && Number.isFinite(prize.amount),
  ) ?? [];
  if (shares.length > 0) {
    if (pool.prizeMode === "pct") {
      items.push(`Prize shares: ${shares.map((prize) => `${prize.place}${ordinalSuffix(prize.place)} ${formatPercent(prize.amount)}`).join(", ")}.`);
    } else {
      items.push(`Prize amounts: ${shares.map((prize) => `${prize.place}${ordinalSuffix(prize.place)} ${formatCurrency(prize.amount)}`).join(", ")}.`);
    }
  }

  const commissionerCut = pool.commissionerCut == null ? 0 : Number(pool.commissionerCut);
  if (Number.isFinite(commissionerCut)) {
    items.push(`Commissioner cut: ${formatPercent(commissionerCut)}.`);
  }

  items.push("Survivor Sharks does not handle money. Your commissioner collects entry fees and pays prizes.");
  return items;
}

function ordinalSuffix(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (place % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export function getPoolRules(pool: PoolRulesPool | null | undefined): PoolRules | null {
  if (!pool || pool.sport !== "nfl") return null;

  if (pool.poolType === "season") {
    return {
      title: "NFL Survivor Season Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Pick one NFL team each week.",
            "You can use each team only once during the season.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: [
            "You can change your pick until that team's game starts. Then the pick locks.",
            "If you do not make a pick before the week's results are processed, it counts as a loss.",
            "A Survivor pool that has already started cannot be joined.",
          ],
        },
        {
          heading: "Scoring or elimination",
          items: [
            "A loss eliminates you. NFL Survivor uses one life.",
            "NFL ties are very rare. If a game ends in a tie, that pick is settled manually and the week's results wait until then.",
            "If everyone still alive loses in the same week before Week 18, that week is voided: nobody is eliminated and the pool continues.",
            "If everyone alive loses in Week 18, all remaining players become co-winners.",
            "When one player remains, that player wins the pool.",
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "If more than one player is still alive after Week 18, they all win and split the first-place prize evenly.",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  if (pool.poolType === "pickem_season") {
    const items = [
      "If weekly bonus is enabled and its player threshold is met, the configured weekly bonus is paid to the weekly winner.",
      "A weekly tie uses the closest guess for combined passing and rushing yards in the week's last scheduled game; tied winners split the bonus.",
      "If a weekly tiebreaker guess or actual is missing, the bonus remains pending.",
    ];
    const weeklyBonusAmount = pool.weeklyBonusAmount == null ? null : Number(pool.weeklyBonusAmount);
    if (weeklyBonusAmount != null && Number.isFinite(weeklyBonusAmount)) {
      items[0] = `If weekly bonus is enabled and its player threshold is met, the weekly winner receives ${formatCurrency(weeklyBonusAmount)}.`;
    }

    return {
      title: "NFL Pick-Ems Season Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Pick a winner for each NFL game on the weekly slate.",
            "You can submit part of a week; a game you leave unpicked earns no points.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: [
            "Each game locks at its own kickoff. Other games stay open until they start.",
          ],
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each correct pick is worth one point.",
            "The season winner is the player with the most correct picks.",
            ...(pool.weeklyBonusEnabled ? items : []),
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "For a Week 18 season tie, guess the combined passing yards and combined rushing yards in the last scheduled game.",
            "Passing-yard accuracy decides first. Rushing-yard accuracy is used only when passing-yard accuracy is exactly tied.",
            "If neither tiebreaker separates the leaders, or the needed data is missing, the prize is split evenly.",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  return null;
}