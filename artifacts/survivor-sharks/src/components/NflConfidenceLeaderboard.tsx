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

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-grid", poolId, week],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/nfl-confidence/grid?week=${week}&season=${currentYear}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const isCurrentWeek = week === (initialWeek ?? 1);

  const ranked = (data?.players ?? [])
    .map((p) => {
      const picks = Object.values(p.picks);
      const won = picks.filter((pk) => pk.result === "correct");
      const pending = picks.filter((pk) => pk.result == null || pk.result === "pending");
      const lost = picks.filter((pk) => pk.result === "incorrect");
      const pointsEarned = won.reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
      const pointsPossible = picks.reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
      return { ...p, won: won.length, lost: lost.length, pending: pending.length, total: picks.length, pointsEarned, pointsPossible };
    })
    .sort((a, b) => b.pointsEarned - a.pointsEarned || b.pointsPossible - a.pointsPossible);

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
          <p className="font-bebas text-lg tracking-wide leading-none">
            {data?.weekLabel ?? `Week ${week}`}
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

      {ranked.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
          <p className="text-sm">Nobody has submitted picks for this week.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ranked.map((player, idx) => {
            const rank = idx + 1;
            const isMe = player.userId === user?.id;
            const allDone = player.pending === 0;

            return (
              <div
                key={player.userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all",
                  isMe
                    ? "border-purple-500/40 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.08)]"
                    : "border-border/30 bg-card/40",
                  rank === 1 ? "border-yellow-500/30 bg-yellow-500/5" : "",
                )}
              >
                <div className="w-8 flex items-center justify-center shrink-0">
                  <RankBadge rank={rank} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-semibold truncate", isMe ? "text-purple-300" : "text-foreground")}>
                      {player.displayName ?? player.username}
                    </span>
                    {isMe && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">You</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-green-400">{player.won}W</span>
                    <span className="text-[11px] text-red-400">{player.lost}L</span>
                    {player.pending > 0 && (
                      <span className="text-[11px] text-muted-foreground/50">{player.pending} pending</span>
                    )}
                    <span className="text-[11px] text-muted-foreground/40">of {player.total} picks</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bebas text-2xl leading-none">
                    <span className={cn(player.pointsEarned > 0 ? "text-green-400" : "text-muted-foreground/40")}>
                      {player.pointsEarned}
                    </span>
                    {!allDone && (
                      <span className="text-sm text-muted-foreground/40">/{player.pointsPossible}</span>
                    )}
                  </div>
                  <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                    {allDone ? "pts" : "pts earned"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ranked.length > 0 && (
        <p className="text-[11px] text-muted-foreground/40 text-center">
          Points earned = confidence points from correct picks only
        </p>
      )}
    </div>
  );
}
