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

function rankLabel(rank: number, isTied: boolean, ended: boolean): string {
  if (ended) {
    if (rank === 1) return isTied ? "Tied for 1st" : "You won!";
    if (rank === 2) return isTied ? "Tied for 2nd place" : "2nd place";
    if (rank === 3) return isTied ? "Tied for 3rd place" : "3rd place";
    return `Pool ended · ${isTied ? "tied for " : ""}${ordinal(rank)} place`;
  }
  return isTied ? `tied for ${ordinal(rank)}` : ordinal(rank);
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
  nfl_confidence: "Confidence — Season",
  nfl_confidence_weekly: "Confidence — Weekly",
  nfl_division_predictor: "Division Predictor",
  group_stage_predictor: "Group Stage",
  wc_bracket: "Bracket",
  dirty_dozen: "Dirty Dozen",
  crazy_8s: "High Heat",
};

export function PoolCard({ pool, pickEmStat }: PoolCardProps) {
  const isWeekly = pool.pickFrequency === "weekly";
  const periodLabel = isWeekly ? "this week" : "today";
  const pt = pool.poolType as string;
  const myIsTied = pickEmStat ? !!(pickEmStat.myStanding as any).isTied : false;

  return (
    <Link href={`/pools/${pool.id}`} className="block h-full group" data-testid={`card-pool-${pool.id}`}>
      <Card className={cn(
        "shark-card h-full flex flex-col transition-all duration-300",
        (pool as any).hasLiveGames
          ? "border-green-500/30 border-l-2 border-l-green-500 hover:border-green-500/60"
          : pool.isActive
          ? "border-amber-500/20 border-l-2 border-l-amber-500/60 hover:border-amber-500/50"
          : "hover:border-border/80"
      )}>
        <CardHeader className="pb-1.5">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="font-bebas text-2xl leading-none truncate">{pool.name}</CardTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              {(pool as any).hasLiveGames && (
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-[11px] font-semibold text-green-400 tracking-wide">Live</span>
                </div>
              )}
              <Badge
                variant={pool.isActive ? "default" : "secondary"}
                className={pool.isActive
                  ? "bg-accent text-accent-foreground hover:bg-accent/80 text-[10px] px-1.5 py-0"
                  : "text-[10px] px-1.5 py-0 opacity-60"}
              >
                {pool.isActive ? "Active" : (pool as any).closureReason === "min_entries_not_met" ? "Cancelled" : "Ended"}
              </Badge>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-widest mt-0.5">
            {pool.sport} • Season {pool.season}
          </div>
          {POOL_TYPE_LABELS[pt] && (
            <span className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded w-fit mt-0.5">
              {pt === "pickem"
                ? (isWeekly ? "Weekly Pick-Ems" : "Daily Pick-Ems")
                : pt === "crazy_8s" && pool.sport === "nhl"
                ? "Hit the Ice"
                : POOL_TYPE_LABELS[pt]}
            </span>
          )}
        </CardHeader>
        <CardContent className="pb-1 flex-grow">
          {pool.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{pool.description}</p>
          )}
          
          <div className="flex gap-3 mt-auto">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5 text-primary/70" />
              <span>{pool.isActive ? `${pool.activeCount ?? 0} / ${pool.memberCount} Alive` : (pool as any).closureReason === "min_entries_not_met" ? "Cancelled" : "Final"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 text-primary/70" />
              <span>{pt === "wc_bracket" ? "WC 2026 Bracket" : `Week ${pool.currentWeek}`}</span>
            </div>
          </div>

          {pickEmStat && (
            <div className="mt-2 space-y-1 border-t border-border/20 pt-2">
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
                  {pickEmStat.lastWinners[0].prizeWon != null
                    ? <span className="text-yellow-400 font-semibold">· ${pickEmStat.lastWinners[0].prizeWon}</span>
                    : (pool.entryFee == null || pool.entryFee === 0)
                    ? <span className="text-muted-foreground/60">· Free pool</span>
                    : null
                  }
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
                              <span className="text-yellow-400 font-semibold">${pickEmStat.myStanding.sovPrizeWon}</span>
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
                              <span className="text-yellow-400 font-semibold">${pickEmStat.myStanding.sovPrizeWon}</span>
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
                  !pool.isActive ? (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🏆" : pickEmStat.myStanding.rank === 2 ? "🥈" : pickEmStat.myStanding.rank === 3 ? "🥉" : "🏁"}</span>
                      <span className="font-medium">
                        {rankLabel(pickEmStat.myStanding.rank, myIsTied, true)}
                      </span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-yellow-400 font-semibold">${(pickEmStat.myStanding as any).prizeWon}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                      <span>
                        You&apos;re{" "}
                        <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                          {rankLabel(pickEmStat.myStanding.rank, myIsTied, false)}
                        </span>
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pickEmStat.myStanding.score ?? 0} pts</span>
                    </div>
                  )
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
              ) : pt === "nfl_confidence_weekly" || pt === "crazy_8s" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  !pool.isActive ? (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🏆" : pickEmStat.myStanding.rank === 2 ? "🥈" : pickEmStat.myStanding.rank === 3 ? "🥉" : "🏁"}</span>
                      <span className="font-medium">
                        {rankLabel(pickEmStat.myStanding.rank, myIsTied, true)}
                      </span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-yellow-400 font-semibold">${(pickEmStat.myStanding as any).prizeWon}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                      <span>
                        You&apos;re{" "}
                        <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                          {rankLabel(pickEmStat.myStanding.rank, myIsTied, false)}
                        </span>
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pickEmStat.myStanding.score ?? 0} pts this week</span>
                    </div>
                  )
                ) : !pool.isActive ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>🏁</span>
                    <span>Pool ended</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet this week</span>
                  </div>
                )
              ) : pt === "nfl_division_predictor" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  !pool.isActive ? (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🏆" : pickEmStat.myStanding.rank === 2 ? "🥈" : pickEmStat.myStanding.rank === 3 ? "🥉" : "🏁"}</span>
                      <span className="font-medium">
                        {rankLabel(pickEmStat.myStanding.rank, myIsTied, true)}
                      </span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-yellow-400 font-semibold">${((pickEmStat.myStanding as any).prizeWon as number).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                      <span>
                        You&apos;re{" "}
                        <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                          {rankLabel(pickEmStat.myStanding.rank, myIsTied, false)}
                        </span>
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pickEmStat.myStanding.score ?? 0}/{pickEmStat.myStanding.maxScore ?? 96} pts</span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <span className="text-yellow-400 font-semibold">
                          · ${((pickEmStat.myStanding as any).prizeWon as number).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )
                ) : pickEmStat.myStanding.hasPicks ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>📋</span>
                    <span>In Progress</span>
                  </div>
                ) : !pool.isActive ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>🏁</span>
                    <span>Pool ended</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500/70">
                    <span aria-hidden>⚠️</span>
                    <span>No picks yet</span>
                  </div>
                )
              ) : pt === "wc_bracket" ? (
                pickEmStat.myStanding.hasPicks && pickEmStat.myStanding.rank >= 1 ? (
                  !pool.isActive ? (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🏆" : pickEmStat.myStanding.rank === 2 ? "🥈" : pickEmStat.myStanding.rank === 3 ? "🥉" : "🏁"}</span>
                      <span className="font-medium">
                        {rankLabel(pickEmStat.myStanding.rank, myIsTied, true)}
                      </span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-yellow-400 font-semibold">${(pickEmStat.myStanding as any).prizeWon}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                      <span>
                        You&apos;re{" "}
                        <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                          {rankLabel(pickEmStat.myStanding.rank, myIsTied, false)}
                        </span>
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pickEmStat.myStanding.correct}/{pickEmStat.myStanding.picked} correct</span>
                    </div>
                  )
                ) : !pool.isActive ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden>🏁</span>
                    <span>Pool ended</span>
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
                  !pool.isActive ? (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🏆" : pickEmStat.myStanding.rank === 2 ? "🥈" : pickEmStat.myStanding.rank === 3 ? "🥉" : "🏁"}</span>
                      <span className="font-medium">
                        {rankLabel(pickEmStat.myStanding.rank, myIsTied, true)}
                      </span>
                      {(pickEmStat.myStanding as any).prizeWon != null && (pickEmStat.myStanding as any).prizeWon > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-yellow-400 font-semibold">${(pickEmStat.myStanding as any).prizeWon}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={cn("flex items-center gap-1.5 text-xs", pickEmStat.myStanding.rank === 1 ? "text-amber-400 font-semibold" : "text-muted-foreground")}>
                      <span aria-hidden>{pickEmStat.myStanding.rank === 1 ? "🥇" : "📊"}</span>
                      <span>
                        You&apos;re{" "}
                        <span className={pickEmStat.myStanding.rank === 1 ? "font-bold" : "text-foreground/70 font-medium"}>
                          {rankLabel(pickEmStat.myStanding.rank, myIsTied, false)}
                        </span>
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{pickEmStat.myStanding.correct}/{pickEmStat.myStanding.picked} correct</span>
                    </div>
                  )
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
          <CardFooter className="pt-0 pb-3">
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
        {pt === "pickem" && !isWeekly && !pool.isActive && (pool.entryFee == null || pool.entryFee === 0) && (
          <CardFooter className="pt-0 pb-3">
            <div className="w-full py-1.5 bg-primary/10 rounded border border-primary/20 text-center">
              <span className="font-bebas text-base tracking-widest text-primary/80">Free Pool</span>
            </div>
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}
