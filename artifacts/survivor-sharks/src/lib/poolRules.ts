import {
  NFL_OFFICE_SUNDAY_REVEAL_SENTENCE,
  nflOfficePoolLockAndVisibilityRules,
} from "./nflOfficePoolCopy";
import {
  nhlWeekendPickemLockAndVisibilityRules,
  NHL_WEEKEND_REVEAL_SENTENCE,
  NHL_WEEKEND_SATURDAY_LOCK_SENTENCE,
} from "./nhlOfficePoolCopy";
import {
  nbaWeekendAtsLockAndVisibilityRules,
  NBA_WEEKEND_REVEAL_SENTENCE,
  NBA_WEEKEND_SUNDAY_LOCK_SENTENCE,
} from "./nbaOfficePoolCopy";

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
  pickFrequency?: string | null;
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
  if (!pool) return null;

  const isNhlWeekendPickem =
    pool.sport === "nhl" &&
    pool.poolType === "pickem" &&
    pool.pickFrequency === "weekly";
  const isNhlSurvivorSeason = pool.sport === "nhl" && pool.poolType === "season";
  const isNhlHitTheIce = pool.poolType === "crazy_8s" && pool.sport === "nhl";
  const isNbaHitTheIce = pool.poolType === "crazy_8s" && pool.sport === "nba";
  const isNbaAts = pool.sport === "nba" && pool.poolType === "nba_ats";

  if (isNhlHitTheIce || isNbaHitTheIce) {
    const sportName = isNhlHitTheIce ? "NHL" : "NBA";
    const gameDays = isNhlHitTheIce ? "Saturday and Sunday" : "Friday, Saturday and Sunday";
    const tiebreakerStat = isNhlHitTheIce ? "shots on goal" : "total points";

    return {
      title: `${sportName} Hit the Ice Rules`,
      sections: [
        {
          heading: "How it works",
          items: [
            `Each weekend, pick the winners of up to 8 ${sportName} games from ${gameDays}. If fewer than 8 games are still open, pick all of them.`,
            "Give each pick a different confidence number from 1 up to the number of games you are picking. Your highest number is your most confident pick.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: isNhlHitTheIce
            ? [
                "Submit all your picks together before the first game you picked starts, or before the pool locks — whichever comes first.",
                NHL_WEEKEND_SATURDAY_LOCK_SENTENCE,
                "Once you submit, your picks are locked in. A second submission is refused.",
              ]
            : [
                "Submit all your picks together before the first game you picked starts, or before the pool locks — whichever comes first.",
                NBA_WEEKEND_SUNDAY_LOCK_SENTENCE,
                "Once you submit, your picks are locked in. A second submission is refused.",
              ],
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each correct pick earns its confidence number. Your weekend score is the total of your correct picks.",
            "The highest score wins the weekend.",
            "A postponed game earns no points and does not hold up the results.",
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            `When you submit, enter one guess for the last game of the weekend: combined ${tiebreakerStat} (both teams).`,
            `If players tie on points, the closest guess wins. If the guess is equally close, the prize is split evenly.`,
            ...(isNhlHitTheIce ? [NHL_WEEKEND_REVEAL_SENTENCE] : []),
            ...(isNbaHitTheIce ? [NBA_WEEKEND_REVEAL_SENTENCE] : []),
          ],
        },
        {
          heading: "Every weekend",
          items: [
            "This pool repeats every weekend. Each weekend is scored on its own, and its winners appear on the pool page.",
            "Your tiebreaker guesses reset each weekend.",
            "The commissioner can stop the pool with End Recurring Pool. The current weekend finishes, then the pool closes.",
          ],
        },
        {
          heading: "Prizes",
          items: [
            ...prizeItems(pool),
            "Prizes are worked out for each weekend.",
          ],
        },
      ],
    };
  }

  if (isNbaAts) {
    return {
      title: "NBA Pick'em (ATS) Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Each Fri–Sun weekend, pick against the spread for every game on the slate when lines are posted.",
            "Most correct covers wins the weekend prize.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: nbaWeekendAtsLockAndVisibilityRules(),
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each correct cover earns one point.",
            "The player with the most correct covers finishes first.",
            "A postponed game is marked postponed and does not add a point.",
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "Enter combined points (both teams) for the last game on the weekend slate.",
            "The closest guess wins; equally close guesses split the prize.",
            `Tiebreaker guesses become visible when the pool locks Sunday at 1:00 PM ET (same moment as everyone's picks).`,
          ],
        },
        {
          heading: "Prizes",
          items: [
            ...prizeItems(pool),
            "Prizes are worked out for each weekend.",
          ],
        },
      ],
    };
  }

  if (isNhlWeekendPickem) {
    return {
      title: "NHL Weekend Pick-Ems Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Pick the winner of each NHL game on Saturday and Sunday.",
            "You do not have to pick every game. An unpicked game earns no points.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: nhlWeekendPickemLockAndVisibilityRules(),
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each correct pick is worth one point.",
            "The player with the most correct picks over the weekend finishes first.",
            "A postponed game is marked postponed and does not add a correct point.",
            "A non-recurring pool closes automatically once the weekend's games are graded, and prizes are assigned.",
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "If picks include Sunday games, you will be asked for combined shots on goal (both teams) on the last game of Sunday's slate.",
            "The closest guess wins; equally close guesses split the prize.",
            "Tiebreaker guesses become visible when the pool locks Saturday at 7:00 PM ET (same moment as everyone's picks).",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  if (isNhlSurvivorSeason) {
    return {
      title: "NHL Survivor Season Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Pick one NHL team from Saturday's games each week.",
            "Each team can be used only once per season.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: [
            "You can change your pick until that team's game starts. Then the pick locks.",
            "A missed pick counts as a loss for that week.",
            "You have three lives. A loss costs one life; your third loss eliminates you.",
            "A postponed pick is a push and does not cost a life.",
            "A Survivor pool that has already started cannot be joined.",
          ],
        },
        {
          heading: "Scoring or elimination",
          items: [
            "The week settles after all of Saturday's games finish, then the pool moves to the next week.",
            "If everyone still alive loses in a non-final week, the week is voided and nobody loses a life.",
            "On the final pickable period, all remaining players become co-winners if everyone still alive loses.",
            "When one player remains, that player wins the pool.",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  if (pool.sport !== "nfl") return null;

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
            `Other players' picks stay hidden until that player's game kicks off. ${NFL_OFFICE_SUNDAY_REVEAL_SENTENCE}`,
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
      "A weekly tie uses the closest guess for the combined passing yards of both teams in the week's last scheduled game; tied winners split the bonus.",
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
          items: nflOfficePoolLockAndVisibilityRules({ fiveMinutePregameLock: false }),
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each correct pick is worth one point.",
            "The season winner is the player with the most correct picks.",
            "While games are in progress, standings may show live points for picks whose team is ahead. Live points are provisional and only final results count.",
            ...(pool.weeklyBonusEnabled ? items : []),
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "Weekly bonus ties use combined passing yards on that week's last scheduled game (when weekly bonus is enabled). Submitted bonus guesses appear on the weekly grid and standings tiebreaker column (same style as NHL weekend pick'em).",
            "For a Week 18 season tie, guess combined passing yards on the last scheduled game.",
            "Closest guess wins; equally close or missing data splits the prize.",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  if (pool.poolType === "nfl_confidence") {
    const weeklyBonusItems = pool.weeklyBonusEnabled
      ? [
          "If weekly bonus is enabled and its player threshold is met, the weekly winner receives the configured bonus.",
          "Weekly bonus ties use combined passing yards on that week's last scheduled game. Submitted bonus guesses appear on the weekly grid and live board tiebreaker column (same style as NHL weekend pick'em).",
        ]
      : [];

    return {
      title: "NFL Confidence Picks — Season Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Pick a winner for every game on the weekly slate and assign a unique confidence value from 1 through the number of games (no repeats).",
            "Higher confidence on correct picks earns more points. The season winner has the highest total points.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: nflOfficePoolLockAndVisibilityRules({ fiveMinutePregameLock: true }),
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Points accumulate all season from correct confidence picks.",
            "While games are in progress, standings may show live points; only final results count.",
            ...weeklyBonusItems,
          ],
        },
        {
          heading: "Tiebreakers",
          items: [
            "Week 18 season ties use combined QB passing yards on the last scheduled game.",
            "Closest guess wins; equally close or missing data splits the prize.",
          ],
        },
        {
          heading: "Prizes",
          items: prizeItems(pool),
        },
      ],
    };
  }

  if (pool.poolType === "nfl_confidence_weekly") {
    return {
      title: "NFL Confidence Picks — Weekly Rules",
      sections: [
        {
          heading: "How it works",
          items: [
            "Each week, pick a winner for every game and assign unique confidence values from 1 through the number of games.",
            "The highest point total for that week wins the weekly prize.",
          ],
        },
        {
          heading: "Picks and deadlines",
          items: nflOfficePoolLockAndVisibilityRules({ fiveMinutePregameLock: true }),
        },
        {
          heading: "Scoring or elimination",
          items: [
            "Each week is scored on its own. Correct picks earn their confidence value.",
            "When players tie on weekly points, the last game on the slate is the tiebreaker: closest guess of combined passing yards (both teams) wins; equal distance splits the prize.",
          ],
        },
        {
          heading: "Prizes",
          items: [
            ...prizeItems(pool),
            "Prizes are worked out for each week.",
          ],
        },
      ],
    };
  }

  return null;
}