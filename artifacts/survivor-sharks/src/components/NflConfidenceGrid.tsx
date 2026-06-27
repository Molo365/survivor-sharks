import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

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
  week: number;
  season: number;
  weekLabel: string;
  games: GameSummary[];
  players: PlayerRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamLogoSrc(team: TeamInfo) {
  return team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;
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

// ── Pick cell ─────────────────────────────────────────────────────────────────

function PickCell({ pick, game }: { pick: PlayerPick | undefined; game: GameSummary }) {
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
        src={teamLogoSrc(team)}
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

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceGrid({ poolId, initialWeek }: { poolId: number; initialWeek?: number }) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const lsKey = `nfl-confidence-grid-week-${poolId}`;
  const [week, setWeekState] = useState(() => {
    const stored = localStorage.getItem(lsKey);
    return stored ? parseInt(stored, 10) : (initialWeek ?? 1);
  });
  function setWeek(updater: number | ((prev: number) => number)) {
    setWeekState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem(lsKey, String(next));
      return next;
    });
  }

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-grid", poolId, week],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/nfl-confidence/grid?week=${week}&season=${currentYear}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const isCurrentWeek = week === (initialWeek ?? 1);

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

      {displayGames.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
          <p className="text-sm">No players have submitted picks for this week.</p>
        </div>
      ) : (
        <div className="overflow-x-auto [scrollbar-width:thin] rounded-lg border border-border/40">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="sticky left-0 z-10 bg-card border-r border-border/40 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Player
                </th>
                {displayGames.map((game) => {
                  const hasScore = game.awayScore != null && game.homeScore != null;
                  return (
                    <th key={game.id} className="px-1 py-2 border-r border-border/20 last:border-r-0 min-w-[80px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                          <img
                            src={teamLogoSrc(game.awayTeam)}
                            alt={game.awayTeam.abbreviation}
                            className="w-4 h-4 object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          <span>{game.awayTeam.abbreviation}</span>
                          <span className="text-muted-foreground/40">@</span>
                          <span>{game.homeTeam.abbreviation}</span>
                          <img
                            src={teamLogoSrc(game.homeTeam)}
                            alt={game.homeTeam.abbreviation}
                            className="w-4 h-4 object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                        {hasScore && (
                          <span className="text-[11px] font-bold text-foreground tabular-nums">
                            {game.awayScore}–{game.homeScore}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? [])
                .slice()
                .sort((a, b) => {
                  const ptsA = Object.values(a.picks).filter(p => p.result === "correct").reduce((s, p) => s + (p.confidencePoints ?? 0), 0);
                  const ptsB = Object.values(b.picks).filter(p => p.result === "correct").reduce((s, p) => s + (p.confidencePoints ?? 0), 0);
                  return ptsB - ptsA;
                })
                .map((player, rowIdx) => {
                const earnedPts = Object.values(player.picks)
                  .filter(p => p.result === "correct")
                  .reduce((sum, p) => sum + (p.confidencePoints ?? 0), 0);
                return (
                  <tr
                    key={player.userId}
                    className={cn(
                      "border-b border-border/20 last:border-b-0 transition-colors hover:bg-muted/10",
                      rowIdx % 2 === 0 ? "bg-card/30" : "bg-card/10",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-card border-r border-border/40 px-3 py-2 whitespace-nowrap">
                      <span className="font-semibold text-sm truncate max-w-[100px] block">
                        {player.displayName ?? player.username}
                      </span>
                    </td>
                    {displayGames.map((game) => (
                      <td key={game.id} className="px-1 py-1 border-r border-border/20 last:border-r-0">
                        <PickCell pick={player.picks[game.id]} game={game} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="font-bebas text-xl text-green-400 leading-none">{earnedPts}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
