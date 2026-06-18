import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  seasonPoints: number;
  weeklyPoints: Record<number, number>;
}

interface SeasonStandingsResponse {
  currentWeek: number;
  totalWeeks: number;
  players: SeasonPlayer[];
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

export function NflConfidenceLeaderboard({ poolId }: { poolId: number; initialWeek?: number }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<SeasonStandingsResponse>({
    queryKey: ["nfl-confidence-season-standings", poolId],
    queryFn: () => authedFetch<SeasonStandingsResponse>(`/api/pools/${poolId}/nfl-confidence/season-standings`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const currentWeek = data?.currentWeek ?? 1;
  // Show columns for weeks 1 through currentWeek only (unplayed weeks omitted)
  const weekColumns = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const players = data?.players ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
        <p className="text-sm">Nobody has submitted graded picks this season.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Horizontally scrollable grid */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="min-w-max"
          style={{ display: "grid", gridTemplateColumns: `2rem 11rem repeat(${weekColumns.length}, 2.75rem) 4rem` }}
        >
          {/* ── Header row ── */}
          <div className="contents">
            {/* # */}
            <div className="px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">
              #
            </div>
            {/* Player */}
            <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Player
            </div>
            {/* Week columns */}
            {weekColumns.map((wk) => (
              <div
                key={wk}
                className="px-0.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center"
              >
                W{wk}
              </div>
            ))}
            {/* Season */}
            <div className="px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right pr-2">
              Total
            </div>
          </div>

          {/* ── Player rows ── */}
          {players.map((player) => {
            const isMe = player.userId === user?.id;
            return (
              <div
                key={player.userId}
                className={cn(
                  "contents",
                  "[&>*]:border-b [&>*]:border-border/20",
                  isMe ? "[&>*]:bg-purple-500/5" : "",
                )}
              >
                {/* Rank */}
                <div
                  className={cn(
                    "flex items-center justify-center py-2.5 rounded-l-lg",
                    player.rank === 1 && !isMe ? "bg-yellow-500/5" : "",
                  )}
                >
                  <RankBadge rank={player.rank} />
                </div>

                {/* Player name */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-2.5 min-w-0",
                    player.rank === 1 && !isMe ? "bg-yellow-500/5" : "",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-semibold truncate",
                      isMe ? "text-purple-300" : "text-foreground",
                    )}
                  >
                    {player.displayName ?? player.username}
                  </span>
                  {isMe && (
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                      You
                    </span>
                  )}
                </div>

                {/* Weekly point cells */}
                {weekColumns.map((wk) => {
                  const pts = player.weeklyPoints[wk];
                  const hasData = pts !== undefined;
                  return (
                    <div
                      key={wk}
                      className={cn(
                        "flex items-center justify-center py-2.5 px-0.5",
                        player.rank === 1 && !isMe ? "bg-yellow-500/5" : "",
                      )}
                    >
                      {hasData ? (
                        <span
                          className={cn(
                            "font-bebas text-base leading-none tabular-nums",
                            pts > 0 ? "text-foreground/80" : "text-muted-foreground/30",
                          )}
                        >
                          {pts}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-xs">—</span>
                      )}
                    </div>
                  );
                })}

                {/* Season total */}
                <div
                  className={cn(
                    "flex items-center justify-end pr-2 py-2.5 rounded-r-lg",
                    player.rank === 1 && !isMe ? "bg-yellow-500/5" : "",
                  )}
                >
                  <span
                    className={cn(
                      "font-bebas text-xl leading-none tabular-nums",
                      player.seasonPoints > 0 ? "text-green-400" : "text-muted-foreground/30",
                    )}
                  >
                    {player.seasonPoints}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/40 text-center">
        Points = confidence points from correct picks only · Total = season cumulative
      </p>
    </div>
  );
}
