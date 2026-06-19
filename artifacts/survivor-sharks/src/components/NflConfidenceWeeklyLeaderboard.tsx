import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Users, Trophy } from "lucide-react";
import { TiebreakerActualsCard } from "@/components/TiebreakerActualsCard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeeklyPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weekPoints: number;
  totalPicks: number;
  gradedPicks: number;
  tiebreakerPassingYardsGuess: number | null;
  tiebreakerRushingYardsGuess: number | null;
  tiebreakerDiff1: number | null;
  tiebreakerDiff2: number | null;
  potSplit: boolean;
}

interface WeeklyLeaderboardResponse {
  week: number;
  players: WeeklyPlayer[];
  actualPassingYards: number | null;
  actualRushingYards: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json() as Promise<T>;
  });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bebas text-xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bebas text-xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bebas text-xl leading-none">🥉</span>;
  return <span className="font-bebas text-lg text-muted-foreground/60">{rank}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceWeeklyLeaderboard({ poolId, initialWeek }: { poolId: number; initialWeek?: number }) {
  const { user } = useAuth();
  const [week, setWeek] = useState(() => initialWeek ?? 1);

  const { data, isLoading } = useQuery<WeeklyLeaderboardResponse>({
    queryKey: ["nfl-confidence-weekly-leaderboard", poolId, week],
    queryFn: () => authedFetch<WeeklyLeaderboardResponse>(`/api/pools/${poolId}/nfl-confidence-weekly/leaderboard?week=${week}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const players = data?.players ?? [];
  const isCurrentWeek = week === (initialWeek ?? 1);
  const isGraded = players.some((p) => p.gradedPicks > 0);
  const isFullyGraded = data?.actualPassingYards != null;
  const weekWinner = isFullyGraded && players.length > 0 ? players[0] : null;

  const maxPts = players[0]?.weekPoints ?? 0;
  const tiedTopPlayers = isFullyGraded && maxPts > 0
    ? players
        .filter((p) => p.weekPoints === maxPts)
        .slice()
        .sort((a, b) => {
          const d1 = (a.tiebreakerDiff1 ?? Infinity) - (b.tiebreakerDiff1 ?? Infinity);
          return d1 !== 0 ? d1 : (a.tiebreakerDiff2 ?? Infinity) - (b.tiebreakerDiff2 ?? Infinity);
        })
    : [];
  const hasTie = tiedTopPlayers.length >= 2;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setWeek((w) => Math.max(1, w - 1))}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="font-bebas text-lg tracking-wide leading-none">Week {week}</p>
          {isCurrentWeek && (
            <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">This Week</span>
          )}
        </div>
        <button
          onClick={() => setWeek((w) => Math.min(18, w + 1))}
          disabled={isCurrentWeek}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Winner banner — shown when the week is fully graded */}
      {weekWinner && (
        <div className="rounded-lg border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 to-amber-600/5 px-4 py-3.5 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-0.5">
              🏆 Week {week} Winner
            </p>
            <p className="font-bebas text-lg tracking-wide leading-none text-foreground truncate">
              {weekWinner.displayName ?? weekWinner.username}
              {weekWinner.potSplit && (
                <span className="text-muted-foreground/60 text-base ml-1.5 font-sans font-normal">(split pot)</span>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bebas text-2xl text-yellow-400 leading-none">{weekWinner.weekPoints}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">pts</p>
          </div>
        </div>
      )}

      {players.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
          <p className="text-sm">Nobody has submitted picks for this week.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_5rem] px-2 pb-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">#</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 pl-2">Player</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right pr-2">
              {isGraded ? "Pts" : "Picks"}
            </div>
          </div>

          {/* Player rows */}
          {players.map((player) => {
            const isMe = player.userId === user?.id;
            return (
              <div
                key={player.userId}
                className={cn(
                  "grid grid-cols-[2rem_1fr_5rem] items-center rounded-lg border py-2.5 px-2",
                  player.rank === 1
                    ? "border-yellow-500/20 bg-yellow-500/5"
                    : isMe
                    ? "border-cyan-500/20 bg-cyan-500/5"
                    : "border-border/20 bg-card/30",
                )}
              >
                {/* Rank */}
                <div className="flex items-center justify-center">
                  <RankBadge rank={player.rank} />
                </div>

                {/* Name */}
                <div className="flex items-center gap-1.5 pl-2 min-w-0">
                  <span
                    className={cn(
                      "text-sm font-semibold truncate",
                      isMe ? "text-cyan-300" : "text-foreground",
                    )}
                  >
                    {player.displayName ?? player.username}
                  </span>
                  {isMe && (
                    <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                      You
                    </span>
                  )}
                  {player.potSplit && (
                    <span className="text-[9px] bg-muted/50 text-muted-foreground/60 px-1.5 py-0.5 rounded font-medium shrink-0">
                      split
                    </span>
                  )}
                </div>

                {/* Points */}
                <div className="flex items-center justify-end pr-2">
                  {isGraded ? (
                    <span
                      className={cn(
                        "font-bebas text-xl leading-none tabular-nums",
                        player.weekPoints > 0 ? "text-green-400" : "text-muted-foreground/30",
                      )}
                    >
                      {player.weekPoints}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground/60 tabular-nums">
                      {player.totalPicks}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tiebreaker actuals (if graded) */}
      {isGraded && data?.actualPassingYards != null && (
        <TiebreakerActualsCard
          actualPassingYards={data.actualPassingYards}
          actualRushingYards={data.actualRushingYards ?? null}
          tiedPlayers={hasTie ? tiedTopPlayers : []}
        />
      )}

      <p className="text-[11px] text-muted-foreground/40 text-center">
        Points = confidence points from correct picks · Resets every week
      </p>
    </div>
  );
}
