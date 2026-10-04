import { useGetPool, getGetPoolQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";

const WEEKLY_BONUS_RESERVE_WEEKS = 18;

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
  const thresholdPot =
    weeklyBonusMinPlayers != null && entryFeeNum > 0
      ? entryFeeNum * weeklyBonusMinPlayers
      : null;
  const seasonEndGuidance =
    thresholdPot != null && weeklyReserved != null ? thresholdPot - weeklyReserved : null;
  const enrolled = pool.totalMembers ?? 0;

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

          {isWeeklyBonusApplicable && pool.weeklyBonusEnabled && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">Weekly bonus</div>
              <div className="bg-background/50 border border-border/40 rounded-lg px-4 py-3 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Each closed week pays up to{" "}
                  <span className="font-semibold text-foreground">${weeklyBonusAmount?.toFixed(2) ?? "0"}</span>
                  {" "}split among winners when at least{" "}
                  <span className="font-semibold text-foreground">{weeklyBonusMinPlayers ?? "—"}</span>
                  {" "}players have joined.
                </p>
                {weeklyBonusAmount != null && weeklyBonusMinPlayers != null && entryFeeNum > 0 && (
                  <div className="space-y-1.5 text-xs border-t border-border/30 pt-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Reserved ({WEEKLY_BONUS_RESERVE_WEEKS} weeks × weekly prize)</span>
                      <span className="font-medium text-foreground">${weeklyReserved!.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        Pot at threshold ({weeklyBonusMinPlayers} × ${entryFeeNum})
                      </span>
                      <span className="font-medium text-foreground">${thresholdPot!.toFixed(2)}</span>
                    </div>
                    {seasonEndGuidance != null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Left for season-end (guidance)</span>
                        <span className={`font-medium ${seasonEndGuidance < 0 ? "text-destructive" : "text-green-400"}`}>
                          ${seasonEndGuidance.toFixed(2)}
                        </span>
                      </div>
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

          {isWeeklyBonusApplicable && !pool.weeklyBonusEnabled && (
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
