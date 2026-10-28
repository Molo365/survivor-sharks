import { useGetPool, getGetPoolQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";

import {
  WEEKLY_BONUS_RESERVE_WEEKS,
  resolveSeasonPrizePot,
  weeklyPercentFromAmount,
} from "@/lib/weeklyBonusWizard";
import {
  inferWeeklyPickEmPayoutModelFromPool,
  periodPotDollars,
  WEEKLY_PICK_EM_PAYOUT_MODEL_OPTIONS,
} from "@/lib/weeklyPickEmPayoutModel";

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatStartingPeriod(start: string, sport: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(startDate.getTime())) return start;

  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);

  if (sport !== "superleague") return `Week of ${format(startDate)}`;

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 3);
  return `${format(startDate)} – ${format(endDate)}`;
}

export function PoolSetupSummary({ poolId }: { poolId: number }) {
  const { data: pool, isLoading } = useGetPool(poolId, {
    query: { queryKey: getGetPoolQueryKey(poolId), staleTime: 60000 },
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (!pool) return null;

  const { sport, poolType } = pool;

  const isMlbNhlMlsSuper = ["mlb", "nhl", "mls", "superleague"].includes(sport);
  const isRecurringApplicable =
    (isMlbNhlMlsSuper && poolType === "pickem") ||
    (poolType as string) === "crazy_8s" ||
    (poolType as string) === "fast_break_multiplier" ||
    poolType === "nba_ats" ||
    poolType === "nfl_confidence_weekly";

  const isStartWeekApplicable =
    sport === "nfl" &&
    ["season", "nfl_confidence", "nfl_confidence_weekly", "pickem_season"].includes(poolType);

  const isStartingPeriodApplicable =
    (sport === "mlb" && ["pickem", "crazy_8s"].includes(poolType as string)) ||
    (["mls", "superleague"].includes(sport) && poolType === "pickem");

  const isPreseasonApplicable =
    (sport === "nfl" && ["season", "nfl_confidence", "pickem_season"].includes(poolType)) ||
    (sport === "nhl" && ["season", "pickem", "crazy_8s"].includes(poolType as string));

  const isLivesApplicable = poolType === "season";
  let lives = 1;
  if (isLivesApplicable) {
    if (["nba", "nhl", "superleague"].includes(sport)) {
      lives = 3;
    } else {
      lives = pool.doubleElimination ? 2 : 1;
    }
  }

  const isWeeklyBonusApplicable =
    (sport === "nfl" && ["pickem_season", "nfl_confidence"].includes(poolType)) ||
    (sport === "nhl" &&
      poolType === "pickem" &&
      pool.pickFrequency === "weekly" &&
      pool.isRecurring === true);

  const weeklyBonusAmount =
    pool.weeklyBonusAmount != null ? Number(pool.weeklyBonusAmount) : null;
  const weeklyBonusMinPlayers = pool.weeklyBonusMinPlayers ?? null;
  const entryFeeNum = pool.entryFee != null ? Number(pool.entryFee) : 0;
  const weeklyReserved =
    weeklyBonusAmount != null ? weeklyBonusAmount * WEEKLY_BONUS_RESERVE_WEEKS : null;
  const enrolled = pool.totalMembers ?? 0;
  const weeklyPct =
    weeklyBonusAmount != null && entryFeeNum > 0
      ? weeklyPercentFromAmount(entryFeeNum, weeklyBonusAmount)
      : null;
  const weeklyThresholdMet =
    pool.weeklyBonusLockedActive === true ||
    (weeklyBonusMinPlayers != null && enrolled >= weeklyBonusMinPlayers);
  const seasonPotNow = resolveSeasonPrizePot({
    entryFee: entryFeeNum,
    memberCount: enrolled,
    weeklyBonusEnabled: pool.weeklyBonusEnabled === true,
    weeklyBonusAmount,
    weeklyThresholdMet,
  });
  const seasonPotIfBelowThreshold = resolveSeasonPrizePot({
    entryFee: entryFeeNum,
    memberCount: enrolled,
    weeklyBonusEnabled: pool.weeklyBonusEnabled === true,
    weeklyBonusAmount,
    weeklyThresholdMet: false,
  });

  const inferredPayoutModel = inferWeeklyPickEmPayoutModelFromPool({
    sport,
    poolType: poolType as string,
    pickFrequency: pool.pickFrequency,
    isRecurring: pool.isRecurring,
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
  });
  const payoutModelLabel =
    inferredPayoutModel != null
      ? WEEKLY_PICK_EM_PAYOUT_MODEL_OPTIONS.find((o) => o.value === inferredPayoutModel)?.title
      : null;
  const periodPotExampleCount = pool.maxEntries && pool.maxEntries > 0 ? pool.maxEntries : Math.max(enrolled, 4);
  const periodPotExample = periodPotDollars(entryFeeNum, periodPotExampleCount);

  return (
    <Card className="border-border/50 bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
          <Info className="w-5 h-5 text-muted-foreground" /> Pool Setup Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Entry Fee</div>
            <div className="font-medium text-foreground">{pool.entryFee ? `$${pool.entryFee}` : "Free"}</div>
          </div>
          
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Max Entries</div>
            <div className="font-medium text-foreground">{pool.maxEntries ? pool.maxEntries : "Unlimited"}</div>
          </div>
          
          {pool.showCommissionerCut && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Commissioner Cut</div>
              <div className="font-medium text-foreground">{pool.commissionerCut}%</div>
            </div>
          )}

          {isRecurringApplicable && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Recurring</div>
              <div className="font-medium text-foreground">{pool.isRecurring ? "Recurring" : "Non-recurring"}</div>
            </div>
          )}

          {isStartWeekApplicable && pool.startWeek != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Start Week</div>
              <div className="font-medium text-foreground">Week {pool.startWeek}</div>
            </div>
          )}

          {isStartingPeriodApplicable && pool.initialPeriodStart != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Starting Period</div>
              <div className="font-medium text-foreground">{formatStartingPeriod(pool.initialPeriodStart, sport)}</div>
            </div>
          )}

          {isPreseasonApplicable && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Preseason</div>
              <div className="font-medium text-foreground">{pool.isPreseason ? "Yes" : "No"}</div>
            </div>
          )}

          {isLivesApplicable && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Lives</div>
              <div className="font-medium text-foreground">{lives}</div>
            </div>
          )}

          {pool.sandboxMode && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Sandbox Mode</div>
              <div className="font-medium text-foreground">Enabled</div>
            </div>
          )}

          {pool.prizeStructure && pool.prizeStructure.length > 0 && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Prize Structure</div>
              <div className="flex flex-wrap gap-2">
                {pool.prizeStructure.map((prize, idx) => (
                  <div key={idx} className="bg-background/50 border border-border/40 rounded px-2.5 py-1 flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{getOrdinal(prize.place)}</span>
                    <span className="font-medium text-foreground text-xs">{prize.amount}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inferredPayoutModel != null && payoutModelLabel && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                Payout model
              </div>
              <div className="font-medium text-foreground">{payoutModelLabel}</div>
              {inferredPayoutModel === "period_pot" && entryFeeNum > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Fresh pot each week: about {periodPotExampleCount} players × ${entryFeeNum} = ${periodPotExample}{" "}
                  to split that week (before organizer share).
                </p>
              )}
            </div>
          )}

          {isWeeklyBonusApplicable && pool.weeklyBonusEnabled && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">Weekly bonus</div>
              <div className="bg-background/50 border border-border/40 rounded-lg px-4 py-3 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Each closed week pays up to{" "}
                  <span className="font-semibold text-foreground">${weeklyBonusAmount?.toFixed(2) ?? "0"}</span>
                  {weeklyPct != null && (
                    <>
                      {" "}
                      (<span className="font-semibold text-foreground">{weeklyPct}%</span> of entry)
                    </>
                  )}
                  {" "}split among winners when at least{" "}
                  <span className="font-semibold text-foreground">{weeklyBonusMinPlayers ?? "—"}</span>
                  {" "}players have joined. Weekly amount stays fixed as more players join.
                </p>
                {weeklyBonusAmount != null && weeklyBonusMinPlayers != null && entryFeeNum > 0 && (
                  <div className="space-y-1.5 text-xs border-t border-border/30 pt-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Money in ({enrolled} × ${entryFeeNum})</span>
                      <span className="font-medium text-foreground">${seasonPotNow.collected.toFixed(2)}</span>
                    </div>
                    {weeklyThresholdMet && weeklyReserved != null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Max weekly reserve ({WEEKLY_BONUS_RESERVE_WEEKS} × ${weeklyBonusAmount.toFixed(2)})
                        </span>
                        <span className="font-medium text-foreground">${weeklyReserved.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        Season prize pot {weeklyThresholdMet ? "(now)" : "(weekly off — full entries)"}
                      </span>
                      <span
                        className={`font-medium ${
                          (weeklyThresholdMet ? seasonPotNow.seasonPot : seasonPotIfBelowThreshold.seasonPot) < 0
                            ? "text-destructive"
                            : "text-green-400"
                        }`}
                      >
                        $
                        {(weeklyThresholdMet ? seasonPotNow.seasonPot : seasonPotIfBelowThreshold.seasonPot).toFixed(
                          2,
                        )}
                      </span>
                    </div>
                    {!weeklyThresholdMet && weeklyReserved != null && enrolled > 0 && (
                      <p className="text-[11px] text-muted-foreground/90 pt-1">
                        If threshold is met with {weeklyBonusMinPlayers}+ players, season guidance becomes $
                        {resolveSeasonPrizePot({
                          entryFee: entryFeeNum,
                          memberCount: enrolled,
                          weeklyBonusEnabled: true,
                          weeklyBonusAmount,
                          weeklyThresholdMet: true,
                        }).seasonPot.toFixed(2)}{" "}
                        at current enrollment.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-t border-border/30 pt-2">
                  <span className="text-muted-foreground">
                    Enrolled:{" "}
                    <span className="font-semibold text-foreground">
                      {enrolled}
                      {weeklyBonusMinPlayers != null ? ` / ${weeklyBonusMinPlayers} required` : ""}
                    </span>
                  </span>
                  {pool.weeklyBonusLockedActive != null && (
                    <span className={pool.weeklyBonusLockedActive ? "text-green-400 font-semibold" : "text-amber-400 font-semibold"}>
                      {pool.weeklyBonusLockedActive
                        ? "Threshold met — weekly payouts eligible"
                        : "Below threshold — weekly payouts off until enough players join"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {isWeeklyBonusApplicable && !pool.weeklyBonusEnabled && inferredPayoutModel === "period_pot" && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                Weekly bonus
              </div>
              <div className="font-medium text-muted-foreground">Off — new money pile each week</div>
            </div>
          )}

          {isWeeklyBonusApplicable && !pool.weeklyBonusEnabled && inferredPayoutModel !== "period_pot" && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Weekly bonus</div>
              <div className="font-medium text-muted-foreground">Not enabled for this pool</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
