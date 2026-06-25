import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, AlertCircle, Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamInfo {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface GameSummary {
  id: string;
  awayTeam: TeamInfo;
  homeTeam: TeamInfo;
  startTime: string;
  status: string;
  awayScore: number | null;
  homeScore: number | null;
}

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
  games: GameSummary[];
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
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysBack = (dow + 1) % 7; // Sat→0, Sun→1, Mon→2 …
  const satDt = new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return satDt.toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function teamLogoSrc(team: TeamInfo, sport: string) {
  return team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/${sport}/500/${team.abbreviation.toLowerCase()}.png`;
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

// ── Game column header ────────────────────────────────────────────────────────

function GameHeader({ game, sport }: { game: GameSummary; sport: string }) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";

  return (
    <div className="flex flex-col items-center gap-1 px-1 min-w-[76px]">
      <div className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground/70 leading-none">
        <img
          src={teamLogoSrc(game.awayTeam, sport)}
          alt={game.awayTeam.abbreviation}
          className="w-4 h-4 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-muted-foreground/40 mx-0.5">@</span>
        <img
          src={teamLogoSrc(game.homeTeam, sport)}
          alt={game.homeTeam.abbreviation}
          className="w-4 h-4 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <span>{game.homeTeam.abbreviation}</span>
      </div>
      {isFinal ? (
        <span className="text-[9px] text-muted-foreground/50 font-semibold">
          Final {game.awayScore}–{game.homeScore}
        </span>
      ) : isLive ? (
        <span className="flex items-center gap-1 text-[9px] font-bold text-red-400">
          <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
          LIVE
        </span>
      ) : (
        <span className="text-[9px] text-muted-foreground/50">
          {game.startTime ? formatTime(game.startTime) : "—"}
        </span>
      )}
    </div>
  );
}

// ── Pick cell ─────────────────────────────────────────────────────────────────

function PickCell({ pick, game, sport }: { pick: PlayerPick | undefined; game: GameSummary; sport: string }) {
  if (!pick) {
    return (
      <div className="flex items-center justify-center min-w-[76px] h-full">
        <span className="text-muted-foreground/20 text-xs">—</span>
      </div>
    );
  }

  const isWin = pick.result === "correct";
  const isLoss = pick.result === "incorrect";
  const pickedIsHome = pick.pickedTeamId === game.homeTeam.id;
  const team = pickedIsHome ? game.homeTeam : game.awayTeam;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-0.5 min-w-[76px] px-1 py-1.5 rounded-md",
      isWin ? "bg-green-500/10" : isLoss ? "bg-red-500/10" : "bg-purple-500/5",
    )}>
      <img
        src={teamLogoSrc(team, sport)}
        alt={team.abbreviation}
        className="w-6 h-6 object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      <span className={cn(
        "text-[9px] font-bold tracking-wide leading-none",
        isWin ? "text-green-400" : isLoss ? "text-red-400" : "text-muted-foreground",
      )}>
        {team.abbreviation}
      </span>
      {pick.confidencePoints != null && (
        <span className={cn(
          "text-[9px] font-bold px-1 rounded leading-none",
          isWin ? "text-green-300" : isLoss ? "text-red-300" : "text-purple-300",
        )}>
          {pick.confidencePoints}pt
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CrazyEightsGrid({
  poolId,
  sport = "mlb",
  sandboxMode = false,
  initialDate,
}: {
  poolId: number;
  sport?: string;
  sandboxMode?: boolean;
  initialDate?: string;
}) {
  const { user } = useAuth();
  const isNhl = sport === "nhl";

  const [date, setDate] = useState(() => {
    if (initialDate) return initialDate;
    if (!isNhl) return getTodayEt();
    if (sandboxMode) return ""; // backend resolves anchor Saturday
    return getCurrentNhlSat();
  });

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, date],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/crazy-eights/grid?date=${date}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Lock in the anchor date the first time the backend resolves it
  useEffect(() => {
    if (date === "" && data?.date) setDate(data.date);
  }, [date, data?.date]);

  // Sandbox NHL caps at the anchor Saturday (not the real current weekend)
  const maxDate = !isNhl ? getTodayEt() : sandboxMode ? (data?.date ?? "") : getCurrentNhlSat();
  const isAtMax = date === "" || date >= maxDate;

  // Only show columns for games at least one player picked
  const pickedGameIds = new Set(
    (data?.players ?? []).flatMap((p) => Object.keys(p.picks)),
  );
  const displayGames = (data?.games ?? []).filter((g) => pickedGameIds.has(g.id));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* No picks yet */}
      {displayGames.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
          <p className="text-sm">
            {isNhl
              ? "No players have submitted picks for this weekend."
              : "No players have submitted picks for this date."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto [scrollbar-width:thin] rounded-lg border border-border/40">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="sticky left-0 z-10 bg-muted/60 backdrop-blur-sm text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px] border-r border-border/40">
                  Player
                </th>
                {displayGames.map((game) => (
                  <th key={game.id} className="px-1 py-2 border-r border-border/20 last:border-r-0">
                    <GameHeader game={game} sport={sport} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? []).map((player, rowIdx) => {
                const totalPts = Object.values(player.picks).reduce(
                  (sum, p) => sum + (p.confidencePoints ?? 0), 0,
                );
                return (
                  <tr
                    key={player.userId}
                    className={cn(
                      "border-b border-border/20 last:border-b-0 transition-colors hover:bg-muted/10",
                      rowIdx % 2 === 0 ? "bg-card/30" : "bg-card/10",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-card/80 backdrop-blur-sm border-r border-border/40 px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate max-w-[90px]">
                          {player.displayName ?? player.username}
                        </span>
                        <span className="text-[9px] text-purple-300 font-bold shrink-0">
                          {totalPts}pt
                        </span>
                      </div>
                    </td>
                    {displayGames.map((game) => (
                      <td key={game.id} className="px-1 py-1 border-r border-border/20 last:border-r-0">
                        <PickCell pick={player.picks[game.id]} game={game} sport={sport} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {displayGames.length > 0 && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" /> Win
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" /> Loss
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-500/10 border border-purple-500/20" /> Pending
          </span>
          <span className="ml-auto text-muted-foreground/50">Numbers = confidence points</span>
        </div>
      )}
    </div>
  );
}
