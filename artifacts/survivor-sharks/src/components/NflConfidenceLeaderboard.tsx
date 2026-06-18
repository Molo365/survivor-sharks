import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerPick {
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface PlayerRow {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, PlayerPick>;
}

interface GridResponse {
  week: number;
  season: number;
  weekLabel: string;
  games: unknown[];
  players: PlayerRow[];
}

interface LeaderboardPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weekPoints: number;
  seasonPoints: number;
  totalPicks: number;
  gradedPicks: number;
  potSplit: boolean;
}

interface LeaderboardResponse {
  week: number;
  players: LeaderboardPlayer[];
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
  return <span className="font-bebas text-lg text-muted-foreground/60 w-6 text-center">{rank}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceLeaderboard({ poolId, initialWeek }: { poolId: number; initialWeek?: number }) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [week, setWeek] = useState(() => initialWeek ?? 1);

  const { data: gridData, isLoading: gridLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-grid", poolId, week],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/nfl-confidence/grid?week=${week}&season=${currentYear}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: lbData, isLoading: lbLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["nfl-confidence-leaderboard", poolId, week],
    queryFn: () => authedFetch<LeaderboardResponse>(`/api/pools/${poolId}/nfl-confidence/leaderboard?week=${week}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const isLoading = gridLoading || lbLoading;
  const isCurrentWeek = week === (initialWeek ?? 1);

  // Build a map of W/L/pending from grid data for the sub-row
  const gridMap = new Map(
    (gridData?.players ?? []).map((p) => {
      const picks = Object.values(p.picks);
      const won = picks.filter((pk) => pk.result === "correct").length;
      const lost = picks.filter((pk) => pk.result === "incorrect").length;
      const pending = picks.filter((pk) => pk.result == null || pk.result === "pending").length;
      const pointsPossible = picks.reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
      return [p.userId, { won, lost, pending, total: picks.length, pointsPossible }];
    }),
  );

  // Use server-ranked players from the leaderboard endpoint; fall back to grid if leaderboard is empty
  const players = lbData?.players ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
          <p className="font-bebas text-lg tracking-wide leading-none">
            {gridData?.weekLabel ?? `Week ${week}`}
          </p>
          {isCurrentWeek && (
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">This Week</span>
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

      {players.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
          <p className="text-sm">Nobody has submitted picks for this week.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem] gap-x-3 items-center px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Wk {week}</span>
            <span className="text-right">Season</span>
          </div>

          {players.map((player) => {
            const isMe = player.userId === user?.id;
            const grid = gridMap.get(player.userId);
            const allDone = (grid?.pending ?? 0) === 0 && (grid?.total ?? 0) > 0;

            return (
              <div
                key={player.userId}
                className={cn(
                  "grid grid-cols-[2rem_1fr_3.5rem_3.5rem] gap-x-3 items-center px-4 py-3 rounded-lg border transition-all",
                  isMe
                    ? "border-purple-500/40 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.08)]"
                    : "border-border/30 bg-card/40",
                  player.rank === 1 ? "border-yellow-500/30 bg-yellow-500/5" : "",
                )}
              >
                {/* Rank */}
                <div className="flex items-center justify-center">
                  <RankBadge rank={player.rank} />
                </div>

                {/* Player name + W/L row */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-semibold truncate text-sm", isMe ? "text-purple-300" : "text-foreground")}>
                      {player.displayName ?? player.username}
                    </span>
                    {isMe && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">You</span>
                    )}
                  </div>
                  {grid && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-green-400">{grid.won}W</span>
                      <span className="text-[11px] text-red-400">{grid.lost}L</span>
                      {grid.pending > 0 && (
                        <span className="text-[11px] text-muted-foreground/50">{grid.pending} pending</span>
                      )}
                      <span className="text-[11px] text-muted-foreground/40">of {grid.total}</span>
                    </div>
                  )}
                </div>

                {/* WK column */}
                <div className="text-right">
                  <div className={cn("font-bebas text-lg leading-none", player.weekPoints > 0 ? "text-foreground/70" : "text-muted-foreground/30")}>
                    {player.weekPoints}
                    {!allDone && grid && grid.pointsPossible > 0 && (
                      <span className="text-[10px] text-muted-foreground/30">/{grid.pointsPossible}</span>
                    )}
                  </div>
                  <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">pts</div>
                </div>

                {/* SEASON column — prominent */}
                <div className="text-right">
                  <div className={cn("font-bebas text-2xl leading-none", player.seasonPoints > 0 ? "text-green-400" : "text-muted-foreground/30")}>
                    {player.seasonPoints}
                  </div>
                  <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {players.length > 0 && (
        <p className="text-[11px] text-muted-foreground/40 text-center">
          Season = cumulative correct-pick confidence points · Wk {week} = this week only
        </p>
      )}
    </div>
  );
}
