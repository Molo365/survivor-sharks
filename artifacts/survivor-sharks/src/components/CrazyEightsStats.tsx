import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Users, Trophy, TrendingUp, Target, Percent } from "lucide-react";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayEt(): string {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  return new Date(Date.now() - FIVE_HOURS_MS).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Returns the Saturday of the current (most recently started) NHL week. */
function getCurrentNhlSat(): string {
  const now = new Date();
  const etOffset = -5 * 60;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const etMin = ((utcMin + etOffset) % (24 * 60) + 24 * 60) % (24 * 60);
  const etDate = new Date(now.getTime() + (etMin - utcMin) * 60_000);
  const dow = etDate.getUTCDay();
  const diffToSat = dow >= 6 ? 0 : dow === 0 ? -1 : -(dow + 1);
  const sat = new Date(Date.UTC(etDate.getUTCFullYear(), etDate.getUTCMonth(), etDate.getUTCDate() + diffToSat));
  return sat.toISOString().slice(0, 10);
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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card/50 border border-border/40 rounded-xl px-5 py-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn("font-bebas text-3xl leading-none tracking-wide", accent ?? "text-foreground")}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CrazyEightsStats({ poolId, sport = "mlb", sandboxMode = false }: { poolId: number; sport?: string; sandboxMode?: boolean }) {
  const { user } = useAuth();
  const isNhl = sport === "nhl";

  const [date, setDate] = useState(() => {
    if (!isNhl) return getTodayEt();
    if (sandboxMode) return "";
    return getCurrentNhlSat();
  });

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, date],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/crazy-eights/grid?date=${date}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    if (date === "" && data?.date) setDate(data.date);
  }, [date, data?.date]);

  const maxDate = !isNhl ? getTodayEt() : sandboxMode ? (data?.date ?? "") : getCurrentNhlSat();
  const isAtMax = date === "" || date >= maxDate;

  // Derived stats
  const players = data?.players ?? [];
  const playersWithPicks = players.filter((p) => Object.keys(p.picks).length > 0);

  const playerScores = playersWithPicks.map((p) => {
    const picks = Object.values(p.picks);
    const pointsEarned = picks.filter((pk) => pk.result === "correct").reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
    const totalWins = picks.filter((pk) => pk.result === "correct").length;
    const totalSettled = picks.filter((pk) => pk.result === "correct" || pk.result === "incorrect").length;
    return { player: p, pointsEarned, totalWins, totalSettled, totalPicks: picks.length };
  });

  const totalSettledPicks = playerScores.reduce((s, p) => s + p.totalSettled, 0);
  const totalWins = playerScores.reduce((s, p) => s + p.totalWins, 0);
  const avgScore = playerScores.length > 0
    ? (playerScores.reduce((s, p) => s + p.pointsEarned, 0) / playerScores.length).toFixed(1)
    : "—";
  const topPlayer = playerScores.sort((a, b) => b.pointsEarned - a.pointsEarned)[0];
  const overallWinPct = totalSettledPicks > 0
    ? Math.round((totalWins / totalSettledPicks) * 100)
    : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date / week nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setDate((d) => offsetDate(d, isNhl ? -7 : -1))}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-center">
          <p className="font-bebas text-lg tracking-wide leading-none">
            {data?.dateLabel ?? date}
          </p>
          {isAtMax && (
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">
              {isNhl ? "This Weekend" : "Today"}
            </span>
          )}
        </div>

        <button
          onClick={() => setDate((d) => offsetDate(d, isNhl ? 7 : 1))}
          disabled={isAtMax}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {playersWithPicks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Data Yet</p>
          <p className="text-sm">Stats will appear once players submit picks.</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              icon={Users}
              label="Players Picked"
              value={playersWithPicks.length}
              sub={isNhl ? "submitted picks this weekend" : "submitted picks today"}
              accent="text-purple-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Score"
              value={avgScore}
              sub="avg confidence points earned"
              accent="text-blue-400"
            />
            {topPlayer && (
              <StatCard
                icon={Trophy}
                label="Top Score"
                value={topPlayer.pointsEarned}
                sub={topPlayer.player.displayName ?? topPlayer.player.username}
                accent="text-yellow-400"
              />
            )}
            {overallWinPct !== null && (
              <StatCard
                icon={Percent}
                label="Pool Win Rate"
                value={`${overallWinPct}%`}
                sub={`${totalWins} wins from ${totalSettledPicks} settled picks`}
                accent={overallWinPct >= 50 ? "text-green-400" : "text-red-400"}
              />
            )}
            <StatCard
              icon={Target}
              label="Total Picks"
              value={playerScores.reduce((s, p) => s + p.totalPicks, 0)}
              sub={isNhl ? "across all players this weekend" : "across all players today"}
              accent="text-foreground"
            />
          </div>

          {/* Per-player score breakdown */}
          <div>
            <h3 className="font-bebas text-xl tracking-wider text-muted-foreground mb-3">Score Breakdown</h3>
            <div className="space-y-2">
              {playerScores
                .sort((a, b) => b.pointsEarned - a.pointsEarned)
                .map(({ player, pointsEarned, totalWins: wins, totalSettled, totalPicks }) => {
                  const pct = totalSettled > 0 ? Math.round((wins / totalSettled) * 100) : null;
                  const isMe = player.userId === user?.id;
                  return (
                    <div
                      key={player.userId}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg border",
                        isMe ? "border-purple-500/30 bg-purple-500/5" : "border-border/20 bg-card/30",
                      )}
                    >
                      <span className={cn("flex-1 text-sm font-medium truncate", isMe ? "text-purple-300" : "")}>
                        {player.displayName ?? player.username}
                        {isMe && <span className="ml-1.5 text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded font-bold">YOU</span>}
                      </span>
                      <span className="text-xs text-muted-foreground/50">{wins}/{totalPicks} wins</span>
                      {pct !== null && (
                        <span className={cn("text-xs font-semibold w-10 text-right", pct >= 50 ? "text-green-400" : "text-red-400")}>
                          {pct}%
                        </span>
                      )}
                      <span className="font-bebas text-xl text-green-400 w-10 text-right leading-none">{pointsEarned}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
