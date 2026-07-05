import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Trophy, Users } from "lucide-react";

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
  date: string;
  dateLabel: string;
  games: unknown[];
  players: PlayerRow[];
}

interface WeekDayBreakdown {
  date: string;
  dateLabel: string;
  pointsEarned: number;
  pointsPossible: number;
  pending: number;
}

interface WeeklyPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weeklyPoints: number;
  days: WeekDayBreakdown[];
}

interface WeeklyLeaderboardResponse {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  players: WeeklyPlayer[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayEt(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function getMondayEt(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(y, m - 1, d + daysToMon)).toISOString().slice(0, 10);
}

function getCurrentNhlSat(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysBack = (dow + 1) % 7;
  return new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

// ── Rank medal ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bebas text-xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bebas text-xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bebas text-xl leading-none">🥉</span>;
  return <span className="font-bebas text-lg text-muted-foreground/60 w-6 text-center">{rank}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function CrazyEightsLeaderboard({ poolId, sport = "mlb", sandboxMode = false }: { poolId: number; sport?: string; sandboxMode?: boolean }) {
  const { user } = useAuth();
  const isNhl = sport === "nhl";

  // ── State (all hooks before any conditional return) ────────────────────────

  const [nhlDate, setNhlDate] = useState(() => {
    if (!isNhl) return "";
    return sandboxMode ? "" : getCurrentNhlSat();
  });

  const [mlbWeekOf, setMlbWeekOf] = useState(() => getMondayEt());

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: nhlData, isLoading: nhlLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, nhlDate],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/crazy-eights/grid?date=${nhlDate}`),
    enabled: !!user && isNhl,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: mlbData, isLoading: mlbLoading } = useQuery<WeeklyLeaderboardResponse>({
    queryKey: ["crazy-eights-weekly-leaderboard", poolId, mlbWeekOf],
    queryFn: () => authedFetch<WeeklyLeaderboardResponse>(`/api/pools/${poolId}/crazy-eights/weekly-leaderboard?weekOf=${mlbWeekOf}`),
    enabled: !!user && !isNhl,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Lock in NHL anchor date on first load (sandbox NHL resolves date from server)
  useEffect(() => {
    if (isNhl && nhlDate === "" && nhlData?.date) setNhlDate(nhlData.date);
  }, [isNhl, nhlDate, nhlData?.date]);

  const currentMonday = getMondayEt();
  const isCurrentMlbWeek = mlbWeekOf >= currentMonday;

  // ── NHL render — unchanged date-based leaderboard ─────────────────────────

  if (isNhl) {
    const maxDate = sandboxMode ? (nhlData?.date ?? "") : getCurrentNhlSat();
    const isAtMax = nhlDate === "" || nhlDate >= maxDate;

    const ranked = (nhlData?.players ?? [])
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

    if (nhlLoading) {
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
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setNhlDate((d) => offsetDate(d, -7))}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="font-bebas text-lg tracking-wide leading-none">{nhlData?.dateLabel ?? nhlDate}</p>
            {isAtMax && (
              <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">This Weekend</span>
            )}
          </div>
          <button
            onClick={() => setNhlDate((d) => offsetDate(d, 7))}
            disabled={isAtMax}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {ranked.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
            <p className="text-sm">Nobody has submitted picks for this weekend.</p>
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
                    isMe ? "border-purple-500/40 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.08)]" : "border-border/30 bg-card/40",
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

  // ── MLB weekly render ──────────────────────────────────────────────────────

  if (mlbLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const players = mlbData?.players ?? [];
  const weekLabel = mlbData?.weekLabel ?? "";
  const weekStart = mlbData?.weekStart ?? "";

  // Build Mon–Sun date array for the breakdown strip
  const weekDays = weekStart
    ? Array.from({ length: 7 }, (_, i) => offsetDate(weekStart, i))
    : [];
  const dowLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const weekWinner = !isCurrentMlbWeek && players.length > 0 ? players[0] : null;

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setMlbWeekOf((w) => offsetDate(w, -7))}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="font-bebas text-lg tracking-wide leading-none">{weekLabel}</p>
          {isCurrentMlbWeek && (
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">This Week</span>
          )}
        </div>
        <button
          onClick={() => setMlbWeekOf((w) => offsetDate(w, 7))}
          disabled={isCurrentMlbWeek}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Winner banner — shown when viewing a completed past week */}
      {weekWinner && (
        <div className="rounded-lg border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 to-amber-600/5 px-4 py-3.5 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-0.5">Week Winner</p>
            <p className="font-bebas text-lg tracking-wide leading-none text-foreground truncate">
              {weekWinner.displayName ?? weekWinner.username}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bebas text-2xl text-yellow-400 leading-none">{weekWinner.weeklyPoints}</p>
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
        <div className="space-y-2">
          {players.map((player) => {
            const isMe = player.userId === user?.id;
            const dayMap = new Map(player.days.map((d) => [d.date, d]));

            return (
              <div
                key={player.userId}
                className={cn(
                  "px-4 py-3 rounded-lg border transition-all",
                  isMe
                    ? "border-purple-500/40 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.08)]"
                    : "border-border/30 bg-card/40",
                  player.rank === 1 ? "border-yellow-500/30 bg-yellow-500/5" : "",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <RankBadge rank={player.rank} />
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
                  </div>

                  <div className="text-right shrink-0">
                    <div className={cn("font-bebas text-2xl leading-none", player.weeklyPoints > 0 ? "text-green-400" : "text-muted-foreground/40")}>
                      {player.weeklyPoints}
                    </div>
                    <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">pts this week</div>
                  </div>
                </div>

                {/* Per-day breakdown strip */}
                {weekDays.length > 0 && (
                  <div className="flex gap-2 mt-2 pl-11">
                    {weekDays.map((date, i) => {
                      const day = dayMap.get(date);
                      return (
                        <div key={date} className="flex flex-col items-center gap-0.5 min-w-[1.75rem]">
                          <span className="text-[9px] text-muted-foreground/40 font-semibold uppercase">{dowLabels[i]}</span>
                          {day ? (
                            <span
                              className={cn(
                                "text-[11px] font-semibold tabular-nums",
                                day.pending > 0
                                  ? "text-amber-400/70"
                                  : day.pointsEarned > 0
                                  ? "text-green-400"
                                  : "text-muted-foreground/40",
                              )}
                            >
                              {day.pointsEarned}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/20">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/40 text-center">
        Points accumulate Mon–Sun · Winner declared Sunday night
      </p>
    </div>
  );
}
