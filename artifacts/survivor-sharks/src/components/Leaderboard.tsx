import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, Activity, Check, Zap, Clock, Trophy, ChevronDown, ChevronUp, Swords, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SovBreakdownItem = { week: number; teamName: string; marginOfVictory: number };

export function Leaderboard({ poolId, pickFrequency }: { poolId: number; pickFrequency?: string }) {
  const [expandedSOV, setExpandedSOV] = useState<number | null>(null);

  const { data: leaderboard, isLoading } = useGetLeaderboard(poolId, {
    query: { enabled: !!poolId, queryKey: getGetLeaderboardQueryKey(poolId) },
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!leaderboard) return null;

  const isDoubleElim = leaderboard.doubleElimination ?? false;
  const maxLives = leaderboard.maxLives ?? (isDoubleElim ? 2 : 1);
  const isDeadlinePassed = leaderboard.deadlinePassed ?? false;
  const isDaily = pickFrequency === "daily" || (leaderboard as any).pickFrequency === "daily";
  const unitLabel = isDaily ? "day" : "week";
  const prizeStructure = (leaderboard as any).prizeStructure as Array<{ place: number; amount: number }> | null ?? null;
  const sovTiebreaker = (leaderboard as any).sovTiebreaker as boolean ?? false;
  const coWinners = (leaderboard as any).coWinners as boolean ?? false;
  const coWinnerPrizeEach = (leaderboard as any).coWinnerPrizeEach as number | null ?? null;
  const voidedWeeks = (leaderboard as any).voidedWeeks as number[] ?? [];

  return (
    <div className="space-y-10">
      {isDeadlinePassed && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border border-border/50 rounded-lg text-sm text-muted-foreground">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Pick deadline has passed — results will be processed at end of week</span>
        </div>
      )}

      {/* ── Voided weeks banner ──────────────────────────────────────────────── */}
      {voidedWeeks.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-sky-500/[0.05] border border-sky-500/25 rounded-lg text-sm text-sky-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
          <div>
            <span className="font-semibold">
              {voidedWeeks.length === 1
                ? `Week ${voidedWeeks[0]} voided`
                : `Weeks ${voidedWeeks.join(", ")} voided`}
              {" "}—{" "}
            </span>
            <span className="text-sky-300/70">
              full-field wipeout averted; picks used, no eliminations recorded.
            </span>
          </div>
        </div>
      )}

      {/* Prize structure legend */}
      {prizeStructure && prizeStructure.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mr-1">Prizes:</span>
          {prizeStructure.map((p) => (
            <span
              key={p.place}
              className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded-full px-2.5 py-0.5 font-semibold"
            >
              {["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th"][p.place - 1]}: ${p.amount}
            </span>
          ))}
        </div>
      )}

      {/* ── SOV Tiebreaker callout ─────────────────────────────────────────── */}
      {sovTiebreaker && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-500/20">
            <Swords className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-bebas text-lg tracking-wide text-amber-300">
                Tiebreaker Applied: Strength of Victory
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Multiple players survived Week 18. The winner was determined by cumulative
                margin of victory across all 18 weeks of picks.
              </p>
            </div>
          </div>
          <div className="divide-y divide-amber-500/10">
            {leaderboard.active.map((entry, idx) => {
              const e = entry as any;
              const sovTotal: number | null = e.sovTotal ?? null;
              const sovBreakdown: SovBreakdownItem[] = e.sovBreakdown ?? [];
              const isOpen = expandedSOV === entry.userId;
              return (
                <div key={entry.userId}>
                  <button
                    type="button"
                    onClick={() => setExpandedSOV(isOpen ? null : entry.userId)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-500/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "font-bebas text-xl w-6 text-center",
                        idx === 0 ? "text-yellow-400" : idx === 1 ? "text-zinc-300" : "text-amber-600",
                      )}>{idx + 1}</span>
                      <span className="font-medium text-sm text-foreground/90">
                        {entry.displayName ?? entry.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-bebas text-xl text-amber-300">
                          {sovTotal != null ? (sovTotal >= 0 ? `+${sovTotal}` : `${sovTotal}`) : "—"}
                        </span>
                        <span className="text-xs text-muted-foreground/50 ml-1">SOV</span>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground/40" />}
                    </div>
                  </button>
                  {isOpen && sovBreakdown.length > 0 && (
                    <div className="px-5 pb-4">
                      <div className="flex flex-wrap gap-2">
                        {sovBreakdown.map((b) => (
                          <span
                            key={b.week}
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-mono",
                              b.marginOfVictory >= 0
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-destructive/10 border-destructive/20 text-destructive/70",
                            )}
                          >
                            <span className="text-muted-foreground/50">Wk{b.week}</span>
                            <span className="font-medium">{b.teamName}</span>
                            <span>{b.marginOfVictory >= 0 ? `+${b.marginOfVictory}` : b.marginOfVictory}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Co-winner callout ───────────────────────────────────────────────── */}
      {coWinners && leaderboard.active.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-emerald-500/20">
            <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <p className="font-bebas text-lg tracking-wide text-emerald-300">
                Co-Champions — Prize Split
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                All remaining survivors lost in Week 18. The prize pool is split equally among {leaderboard.active.length} co-champion{leaderboard.active.length !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>
          <div className="divide-y divide-emerald-500/10">
            {leaderboard.active.map((entry, idx) => (
              <div key={entry.userId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-bebas text-xl w-6 text-center",
                    idx === 0 ? "text-yellow-400" : "text-emerald-500/60",
                  )}>
                    {idx + 1}
                  </span>
                  <span className="font-medium text-sm text-foreground/90">
                    {entry.displayName ?? entry.username}
                  </span>
                </div>
                <span className="font-bebas text-lg text-emerald-300">
                  {coWinnerPrizeEach != null ? `$${coWinnerPrizeEach}` : "Equal share"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-bebas text-3xl text-primary flex items-center gap-3 mb-6 tracking-wide">
          <Activity className="w-7 h-7" /> {coWinners ? "CO-CHAMPIONS" : "THE SURVIVORS"}
        </h3>
        <div className="space-y-3">
          {leaderboard.active.map((entry, idx) => {
            const streak = entry.streak ?? 0;
            const strikeCount = entry.strikeCount ?? 0;
            const hasWon = entry.hasWonThisWeek ?? false;
            const prizeWon = (entry as any).prizeWon as number | null ?? null;
            return (
              <div
                key={entry.userId}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-card border border-border/50 rounded-lg hover:border-primary/50 transition-all shark-card"
              >
                <div className="flex items-center gap-5 mb-3 sm:mb-0">
                  <div className="font-bebas text-3xl text-primary/40 w-8 text-center">{idx + 1}</div>
                  <div>
                    <div className="font-medium text-xl flex items-center gap-2">
                      {entry.displayName || entry.username}
                      {maxLives > 1 && strikeCount > 0 && (
                        <span
                          title={strikeCount >= maxLives - 1
                            ? "Final warning — one more loss eliminates this player"
                            : `Warning strike ${strikeCount} of ${maxLives - 1}`}
                          className="inline-flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30"
                        >
                          <Zap className="w-3 h-3" /> {strikeCount === 1 ? "Strike" : `${strikeCount} Strikes`}
                        </span>
                      )}
                    </div>
                    {streak >= 2 && (
                      <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1 mt-0.5">
                        🔥 {streak}-{unitLabel} streak
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-13 sm:ml-0 flex-wrap">
                  {entry.lastPickTeam && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="uppercase text-xs tracking-wider">Pick:</span>
                      <span
                        className={cn(
                          "font-medium text-foreground bg-muted/30 px-2 py-1 rounded flex items-center gap-1",
                          hasWon && "bg-green-500/10 text-green-400"
                        )}
                      >
                        {entry.lastPickTeam}
                        {hasWon && (
                          <span title="Won a game this week!">
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {prizeWon !== null && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded border bg-yellow-500/10 text-yellow-300 border-yellow-500/30">
                      <Trophy className="w-3 h-3" /> ${prizeWon}
                    </span>
                  )}
                  <Badge className={cn(
                    "font-bebas text-lg px-4 py-1 tracking-wider",
                    coWinners
                      ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/30"
                      : "bg-accent/10 text-accent border border-accent/30",
                  )}>
                    {coWinners ? "CO-CHAMP" : "ALIVE"}
                  </Badge>
                </div>
              </div>
            );
          })}
          {leaderboard.active.length === 0 && (
            <div className="text-muted-foreground p-8 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
              No active members remain.
            </div>
          )}
        </div>
      </div>

      {leaderboard.eliminated.length > 0 && (
        <div>
          <h3 className="font-bebas text-3xl text-destructive flex items-center gap-3 mb-6 tracking-wide">
            <Skull className="w-7 h-7" /> THE FALLEN
          </h3>
          <div className="space-y-3">
            {leaderboard.eliminated.map((entry, idx) => (
              <div
                key={entry.userId}
                className="flex items-center justify-between p-5 bg-destructive/5 border border-destructive/20 rounded-lg opacity-80"
              >
                <div className="flex items-center gap-5">
                  <div className="font-bebas text-2xl text-muted-foreground/50 w-8 text-center">
                    {leaderboard.active.length + idx + 1}
                  </div>
                  <div className="font-medium text-lg line-through text-muted-foreground">
                    {entry.displayName || entry.username}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2 text-destructive font-bebas text-lg tracking-wider">
                    ELIMINATED {isDaily ? "DAY" : "WK"} {entry.eliminatedWeek}
                  </div>
                  {entry.lastPickTeam && (
                    <div className="text-xs text-muted-foreground">
                      Fatal Pick:{" "}
                      <span className="font-medium text-foreground/70">{entry.lastPickTeam}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
