import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import { Pool, PoolPickEmStat } from "@workspace/api-client-react";
import { Link } from "wouter";
import { PrizeDisplay } from "@/components/PrizeDisplay";
import { cn } from "@/lib/utils";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface PoolCardProps {
  pool: Pool;
  pickEmStat?: PoolPickEmStat;
}

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);

const POOL_TYPE_LABELS: Record<string, string> = {
  season: "Survivor",
  weekly: "Survivor",
  mid_season: "Survivor",
  pickem: "Pick-Ems",
  pickem_season: "Pick-Em Season",
  nfl_confidence: "Confidence",
  nfl_confidence_weekly: "Confidence Weekly",
  nfl_division_predictor: "Division Predictor",
  group_stage_predictor: "Group Stage",
  wc_bracket: "Bracket",
  dirty_dozen: "Dirty Dozen",
  crazy_8s: "Crazy 8's",
};

export function PoolCard({ pool, pickEmStat }: PoolCardProps) {
  const isWeekly = pool.pickFrequency === "weekly";
  const periodLabel = isWeekly ? "this week" : "today";
  const pt = pool.poolType as string;

  return (
    <Link href={`/pools/${pool.id}`} className="block h-full group" data-testid={`card-pool-${pool.id}`}>
      <Card className="shark-card h-full flex flex-col hover:border-primary transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="font-bebas text-2xl truncate">{pool.name}</CardTitle>
            <Badge
              variant={pool.isActive ? "default" : "secondary"}
              className={pool.isActive ? "bg-accent text-accent-foreground hover:bg-accent/80" : ""}
            >
              {pool.isActive ? "Active" : (pool as any).closureReason === "min_entries_not_met" ? "Cancelled" : "Ended"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {pool.sport} • Season {pool.season}
          </div>
          {POOL_TYPE_LABELS[pt] && (
            <span className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded w-fit">
              {pt === "pickem"
                ? (isWeekly ? "Weekly Pick-Ems" : "Daily Pick-Ems")
                : POOL_TYPE_LABELS[pt]}
            </span>
          )}
        </CardHeader>
        <CardContent className="pb-2 flex-grow">
          {pool.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{pool.description}</p>
          )}
          
          <div className="flex gap-4 mt-auto">
            <div className="flex items-center gap-1.5 text-sm">
              <Users className="w-4 h-4 text-primary" />
              <span>{pool.isActive ? `${pool.activeCount ?? 0} / ${pool.memberCount} Alive` : (pool as any).closureReason === "min_entries_not_met" ? "Cancelled" : "Final"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="w-4 h-4 text-primary" />
              <span>{pt === "wc_bracket" ? "WC 2026 Bracket" : `Week ${pool.currentWeek}`}</span>
            </div>
          </div>

          {pickEmStat && (
            <div className="mt-3 space-y-1 border-t border-border/20 pt-3">
              {/* Last winner(s) — all tied top scorers from the previous period */}
              {pickEmStat.lastWinners && pickEmStat.lastWinners.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden>🏆</span>
                  <span>
                    Last winner{pickEmStat.lastWinners.length > 1 ? "s" : ""}:{" "}
                    <span className="text-foreground/70 font-medium">
                      {pickEmStat.lastWinners.map(w => w.displayName || w.username).join(" & ")}
                    </span>
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  {pickEmStat.lastWinners[0].score != null
                    ? <span>{pickEmStat.lastWinners[0].score} pts</span>
                    : <span>{pickEmStat.lastWinners[0].correct}/{pickEmStat.lastWinners[0].picked} correct</span>
                  }
                  {pickEmStat.lastWinners[0].prizeWon != null && (
                    <span className="text-yellow-400">· ${pickEmStat.lastWinners[0].prizeWon}</span>
                  )}
                </div>
              )}

              {/* My standing — pool-type-specific */}
              {SURVIVOR_TYPES.has(pt) ? (
                pickEmStat.myStanding.status === "alive" ? (
                  // Ended season pool: show winner outcome; otherwise "You're alive"
                  !pool.isActive && pt === "season" ? (
                    pickEmStat.myStanding.closureReason === "co_winners" ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <span aria-hidden>🏆</span>
                        <span className="font-medium">Co-Champion — Prize Split</span>
                        {pickEmStat.myStanding.coWinnerPrize != null && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>${pickEmStat.myStanding.coWinnerPrize} each</span>
                          </>
                        )}
                      </div>
                    ) : pickEmStat.myStanding.closureReason === "sov_tiebreaker" ? (
                      pickEmStat.myStanding.sovRank === 1 ? (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <span aria-hidden>🏆</span>
                          <span className="font-medium">You won!</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="opacity-70">Tiebreaker: SOV</span>
                          {pickEmStat.myStanding.sovPrizeWon != null && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-yellow-400">${pickEmStat.myStanding.sovPrizeWon}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span aria-hidden>📊</span>
                          <span>Tiebreaker: {ordinal(pickEmStat.myStanding.sovRank ?? 0)} place</span>
                          {pickEmStat.myStanding.sovPrizeWon != null && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-yellow-400">${pickEmStat.myStanding.sovPrizeWon}</span>
                            </>
                          )}
                        </div>
                      )
                    ) : (
                      // null closureReason = last survivor standing
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <span aria-hidden>🏆</span>
                        <span className="font-medium">You won!</span>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden>💪</span>
                      <span className="text-foreground/70 font-medium">You&apos;re alive</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pool.activeCount ?? 0} alive</span>
                    </div>
                  )
                ) : pickEmStat.myStanding.status === "eliminated" ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>💀</span>
                    <span>
                      Eliminated{pickEmStat.myStanding.eliminatedWeek
                        ? ` · week ${pickEmStat.myStanding.eliminatedWeek}`
                        : ""}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet {periodLabel}</span>
                  </div>
                )
              ) : pt === "nfl_confidence" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                    <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                    <span>
                      You&apos;re{" "}
                      <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                        {ordinal(pickEmStat.myStanding.rank)}
                      </span>
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pickEmStat.myStanding.score ?? 0} pts</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet {periodLabel}</span>
                  </div>
                )
              ) : pt === "nfl_confidence_weekly" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                    <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                    <span>
                      You&apos;re{" "}
                      <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                        {ordinal(pickEmStat.myStanding.rank)}
                      </span>
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pickEmStat.myStanding.score ?? 0} pts this week</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet this week</span>
                  </div>
                )
              ) : pt === "nfl_division_predictor" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                    <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                    <span>
                      You&apos;re{" "}
                      <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                        {ordinal(pickEmStat.myStanding.rank)}
                      </span>
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pickEmStat.myStanding.score ?? 0}/{pickEmStat.myStanding.maxScore ?? 96} pts</span>
                  </div>
                ) : pickEmStat.myStanding.hasPicks ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>📋</span>
                    <span>In Progress</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet</span>
                  </div>
                )
              ) : pt === "wc_bracket" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                    <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                    <span>
                      You&apos;re{" "}
                      <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                        {ordinal(pickEmStat.myStanding.rank)}
                      </span>
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pickEmStat.myStanding.correct}/{pickEmStat.myStanding.picked} correct</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No bracket picks yet</span>
                  </div>
                )
              ) : (
                /* pickem (MLB/WC pickem) and pickem_season — "X/Y correct" style */
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                    <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                    <span>
                      You&apos;re{" "}
                      <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                        {ordinal(pickEmStat.myStanding.rank)}
                      </span>
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pickEmStat.myStanding.correct}/{pickEmStat.myStanding.picked} correct</span>
                  </div>
                ) : !pool.isActive ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>🏁</span>
                    <span>Pool ended</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet {periodLabel}</span>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
        {(pool.prizePot && pool.prizePot > 0 || !!((pool as any).prizeStructure as any)?.length) &&
         !(!pool.isActive && SURVIVOR_TYPES.has(pt) && pickEmStat?.myStanding?.sovPrizeWon != null) && (
          <CardFooter className="pt-0 pb-4">
            <PrizeDisplay
              variant="pool-card"
              prizeStructure={(pool as any).prizeStructure}
              prizePot={pool.prizePot}
              prizeMode={(pool as any).prizeMode ?? "fixed"}
              entryFee={pool.entryFee}
              maxEntries={pool.maxEntries}
              actualEntries={pool.memberCount}
            />
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}
